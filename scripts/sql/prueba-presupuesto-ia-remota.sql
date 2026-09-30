-- Presupuesto mensual del asistente de IA (0031), contra la base real (npm run test:db).
--
-- Se prueba lo que hace el servidor (sumar el gasto de cada consulta, cambiar el presupuesto a nombre de la
-- gerencia) y lo que NO puede hacer nadie con sesión (descontarse el gasto, subirse el tope, ver lo de otro
-- CRM). CRMs y usuarios ficticios; termina con un error forzado que lo deshace todo.
DO $prueba$
DECLARE
    res JSONB := '[]'::jsonb;
    co_a UUID := gen_random_uuid();
    co_b UUID := gen_random_uuid();
    u_admin UUID := gen_random_uuid();
    u_mgr_a UUID := gen_random_uuid();
    u_agent_a UUID := gen_random_uuid();
    u_off_a UUID := gen_random_uuid();
    u_mgr_b UUID := gen_random_uuid();
    v_count INTEGER;
    v_fila RECORD;
    v_num NUMERIC;
    v_fecha DATE;
    v_columnas TEXT[];
BEGIN
    -- ------------------------------------------------------------ datos de prueba (rol privilegiado)
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (u_admin, 'admin.ia@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_a, 'gerente.ia@prueba.invalid', 'authenticated', 'authenticated'),
           (u_agent_a, 'vendedor.ia@prueba.invalid', 'authenticated', 'authenticated'),
           (u_off_a, 'inactivo.ia@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_b, 'gerente.otro.ia@prueba.invalid', 'authenticated', 'authenticated');
    INSERT INTO public.companies (id, name, slug) VALUES
        (co_a, 'CRM IA A', 'ia-a-' || left(co_a::text, 8)),
        (co_b, 'CRM IA B', 'ia-b-' || left(co_b::text, 8));
    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_a, 'CL'), (co_b, 'CL') ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, company_id, full_name, email, role, is_active) VALUES
        (u_admin, NULL, 'Admin IA', 'admin.ia@prueba.invalid', 'superadmin', TRUE),
        (u_mgr_a, co_a, 'Gerente IA', 'gerente.ia@prueba.invalid', 'manager', TRUE),
        (u_agent_a, co_a, 'Vendedor IA', 'vendedor.ia@prueba.invalid', 'agent', TRUE),
        (u_off_a, co_a, 'Gerente Inactivo IA', 'inactivo.ia@prueba.invalid', 'manager', FALSE),
        (u_mgr_b, co_b, 'Gerente Otro IA', 'gerente.otro.ia@prueba.invalid', 'manager', TRUE);

    -- ------------------------------------------------------------ el servidor anota el gasto (service_role)
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, TRUE);

    PERFORM public.record_ai_usage(co_a, 1000, 200, 500, 0.000241);
    PERFORM public.record_ai_usage(co_a, 1000, 200, 500, 0.000241);
    SELECT count(*) INTO v_count FROM public.ai_usage_monthly WHERE company_id = co_a;
    SELECT * INTO v_fila FROM public.ai_usage_monthly WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Dos consultas del mismo mes se suman en una sola fila: 2 llamadas, sus tokens y su costo',
        'ok', v_count = 1 AND v_fila.requests = 2 AND v_fila.input_tokens = 2000 AND v_fila.cached_input_tokens = 400
              AND v_fila.output_tokens = 1000 AND v_fila.cost_usd = 0.000482,
        'detalle', to_jsonb(v_fila));

    v_fecha := date_trunc('month', NOW() AT TIME ZONE 'UTC')::date;
    res := res || jsonb_build_object('prueba', 'El gasto se anota en el mes en curso (primer día, en UTC)', 'ok', v_fila.month = v_fecha, 'detalle', v_fila.month);

    PERFORM public.record_ai_usage(co_a, -5, -5, -5, -1);
    SELECT * INTO v_fila FROM public.ai_usage_monthly WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Un gasto negativo no descuenta: cuenta la llamada pero no resta tokens ni dólares',
        'ok', v_fila.requests = 3 AND v_fila.input_tokens = 2000 AND v_fila.cost_usd = 0.000482, 'detalle', to_jsonb(v_fila));

    PERFORM public.record_ai_usage(co_b, 10, 0, 5, 0.000001);
    SELECT cost_usd INTO v_num FROM public.ai_usage_monthly WHERE company_id = co_a;
    SELECT count(*) INTO v_count FROM public.ai_usage_monthly WHERE company_id = co_b;
    res := res || jsonb_build_object('prueba', 'El gasto de un CRM no toca al de otro: cada uno tiene su fila',
        'ok', v_num = 0.000482 AND v_count = 1, 'detalle', jsonb_build_object('crm_a', v_num, 'filas_b', v_count));

    -- ------------------------------------------------------------ el servidor cambia el presupuesto a nombre de la gerencia
    v_num := public.set_company_ai_budget(co_a, u_mgr_a, 45.5);
    SELECT * INTO v_fila FROM public.company_ai_settings WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'La gerencia del CRM fija su presupuesto (US$ 45,50) y queda anotado quién lo hizo',
        'ok', v_num = 45.5 AND v_fila.monthly_budget_usd = 45.5 AND v_fila.updated_by = u_mgr_a, 'detalle', to_jsonb(v_fila));

    PERFORM public.set_company_ai_budget(co_a, u_mgr_a, 60);
    PERFORM public.set_company_ai_budget(co_a, u_mgr_a, 60);
    SELECT count(*) INTO v_count FROM public.company_ai_settings WHERE company_id = co_a;
    SELECT monthly_budget_usd INTO v_num FROM public.company_ai_settings WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Cambiarlo otra vez actualiza la misma fila (una por CRM)', 'ok', v_count = 1 AND v_num = 60, 'detalle', jsonb_build_object('filas', v_count, 'valor', v_num));

    PERFORM public.set_company_ai_budget(co_a, u_mgr_a, 0);
    SELECT monthly_budget_usd INTO v_num FROM public.company_ai_settings WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Con 0 el asistente queda apagado (es un valor válido)', 'ok', v_num = 0, 'detalle', v_num);
    PERFORM public.set_company_ai_budget(co_a, u_mgr_a, 60);

    -- ------------------------------------------------------------ quién NO puede cambiarlo
    BEGIN
        PERFORM public.set_company_ai_budget(co_a, u_agent_a, 500);
        res := res || jsonb_build_object('prueba', 'Un usuario base no cambia el presupuesto', 'ok', FALSE, 'detalle', 'lo cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un usuario base no cambia el presupuesto', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_budget(co_a, u_mgr_b, 500);
        res := res || jsonb_build_object('prueba', 'La gerencia de otro CRM no cambia el presupuesto de este', 'ok', FALSE, 'detalle', 'lo cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La gerencia de otro CRM no cambia el presupuesto de este', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_budget(co_a, u_off_a, 500);
        res := res || jsonb_build_object('prueba', 'Un gerente desactivado no cambia el presupuesto', 'ok', FALSE, 'detalle', 'lo cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un gerente desactivado no cambia el presupuesto', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_budget(co_a, u_admin, 500);
        res := res || jsonb_build_object('prueba', 'El administrador de la plataforma tampoco: el presupuesto es de la gerencia de cada CRM', 'ok', FALSE, 'detalle', 'lo cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'El administrador de la plataforma tampoco: el presupuesto es de la gerencia de cada CRM', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_budget(co_a, gen_random_uuid(), 500);
        res := res || jsonb_build_object('prueba', 'Una persona que no existe no cambia el presupuesto', 'ok', FALSE, 'detalle', 'lo cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Una persona que no existe no cambia el presupuesto', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_budget(co_a, u_mgr_a, -1);
        res := res || jsonb_build_object('prueba', 'Un presupuesto negativo se rechaza', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un presupuesto negativo se rechaza', 'ok', SQLSTATE = '23514', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_budget(co_a, u_mgr_a, 1001);
        res := res || jsonb_build_object('prueba', 'Un presupuesto sobre US$ 1.000 se rechaza', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un presupuesto sobre US$ 1.000 se rechaza', 'ok', SQLSTATE = '23514', 'detalle', SQLSTATE);
    END;
    SELECT monthly_budget_usd INTO v_num FROM public.company_ai_settings WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Ningún intento rechazado cambió el presupuesto', 'ok', v_num = 60, 'detalle', v_num);

    -- ------------------------------------------------------------ registro de cambios
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_count FROM public.change_log
    WHERE table_name = 'company_ai_settings' AND company_id = co_a AND actor_id = u_mgr_a AND actor_role = 'manager';
    -- 45,5 (crea) · 60 (cambia) · 60 otra vez (sin cambio, no cuenta) · 0 (cambia) · 60 (cambia)
    res := res || jsonb_build_object('prueba', 'Cada cambio real del presupuesto queda en change_log con su autor; repetir el mismo valor no', 'ok', v_count = 4, 'detalle', v_count);
    SELECT changed_columns INTO v_columnas FROM public.change_log
    WHERE table_name = 'company_ai_settings' AND company_id = co_a AND operation = 'UPDATE' LIMIT 1;
    res := res || jsonb_build_object('prueba', 'El registro dice qué columna cambió, nunca su valor', 'ok', v_columnas = ARRAY['monthly_budget_usd'], 'detalle', v_columnas);

    -- ------------------------------------------------------------ reglas de la tabla (rol privilegiado)
    BEGIN
        INSERT INTO public.company_ai_settings (company_id, monthly_budget_usd) VALUES (co_b, 2000);
        res := res || jsonb_build_object('prueba', 'La tabla rechaza presupuestos fuera de 0 a 1.000', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La tabla rechaza presupuestos fuera de 0 a 1.000', 'ok', SQLSTATE = '23514', 'detalle', SQLSTATE);
    END;
    BEGIN
        INSERT INTO public.company_ai_settings (company_id, monthly_budget_usd, updated_by) VALUES (co_b, 10, u_mgr_a);
        res := res || jsonb_build_object('prueba', 'Quien cambia el presupuesto debe ser del mismo CRM', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Quien cambia el presupuesto debe ser del mismo CRM', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        INSERT INTO public.company_ai_settings (company_id, monthly_budget_usd) VALUES (co_a, 10);
        res := res || jsonb_build_object('prueba', 'Un CRM no puede tener dos presupuestos', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un CRM no puede tener dos presupuestos', 'ok', SQLSTATE = '23505', 'detalle', SQLSTATE);
    END;
    BEGIN
        INSERT INTO public.ai_usage_monthly (company_id, month, cost_usd) VALUES (co_a, v_fecha, -1);
        res := res || jsonb_build_object('prueba', 'La tabla de gasto no admite costos negativos', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La tabla de gasto no admite costos negativos', 'ok', SQLSTATE IN ('23514', '23505'), 'detalle', SQLSTATE);
    END;

    -- ------------------------------------------------------------ lectura de las personas con sesión
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_a, 'role', 'authenticated')::text, TRUE);
    SELECT count(*) INTO v_count FROM public.company_ai_settings WHERE company_id IN (co_a, co_b);
    SELECT count(*) INTO v_num FROM public.ai_usage_monthly WHERE company_id IN (co_a, co_b);
    res := res || jsonb_build_object('prueba', 'Un usuario del CRM A ve el presupuesto y el gasto de su CRM, y nada del CRM B',
        'ok', v_count = 1 AND v_num = 1, 'detalle', jsonb_build_object('presupuestos', v_count, 'gastos', v_num));
    SELECT count(*) INTO v_count FROM public.ai_usage_monthly WHERE company_id = co_b;
    res := res || jsonb_build_object('prueba', 'Pedir directamente el gasto del otro CRM no devuelve nada', 'ok', v_count = 0, 'detalle', v_count);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_b, 'role', 'authenticated')::text, TRUE);
    SELECT count(*) INTO v_count FROM public.company_ai_settings WHERE company_id = co_a;
    SELECT count(*) INTO v_num FROM public.ai_usage_monthly WHERE company_id = co_b;
    res := res || jsonb_build_object('prueba', 'La gerencia del CRM B no ve el presupuesto del A, y sí su propio gasto',
        'ok', v_count = 0 AND v_num = 1, 'detalle', jsonb_build_object('presupuesto_a', v_count, 'gasto_b', v_num));

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, TRUE);
    SELECT count(*) INTO v_count FROM public.ai_usage_monthly WHERE company_id IN (co_a, co_b);
    res := res || jsonb_build_object('prueba', 'El administrador de la plataforma ve el gasto de todos los CRMs', 'ok', v_count = 2, 'detalle', v_count);

    -- ------------------------------------------------------------ lo que nadie con sesión puede hacer
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_a, 'role', 'authenticated')::text, TRUE);
    BEGIN
        UPDATE public.company_ai_settings SET monthly_budget_usd = 1000 WHERE company_id = co_a;
        res := res || jsonb_build_object('prueba', 'Ni la gerencia se sube el tope escribiendo la tabla directo', 'ok', FALSE, 'detalle', 'lo cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Ni la gerencia se sube el tope escribiendo la tabla directo', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        INSERT INTO public.company_ai_settings (company_id, monthly_budget_usd) VALUES (co_b, 1000);
        res := res || jsonb_build_object('prueba', 'Nadie con sesión crea un presupuesto a mano', 'ok', FALSE, 'detalle', 'lo creó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie con sesión crea un presupuesto a mano', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        DELETE FROM public.company_ai_settings WHERE company_id = co_a;
        res := res || jsonb_build_object('prueba', 'Nadie con sesión borra el presupuesto', 'ok', FALSE, 'detalle', 'lo borró');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie con sesión borra el presupuesto', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        DELETE FROM public.ai_usage_monthly WHERE company_id = co_a;
        res := res || jsonb_build_object('prueba', 'Nadie con sesión se borra el gasto para seguir usando el asistente', 'ok', FALSE, 'detalle', 'lo borró');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie con sesión se borra el gasto para seguir usando el asistente', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        UPDATE public.ai_usage_monthly SET cost_usd = 0 WHERE company_id = co_a;
        res := res || jsonb_build_object('prueba', 'Nadie con sesión se rebaja el gasto', 'ok', FALSE, 'detalle', 'lo cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie con sesión se rebaja el gasto', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.record_ai_usage(co_a, 1, 0, 1, 0);
        res := res || jsonb_build_object('prueba', 'Nadie con sesión ejecuta record_ai_usage', 'ok', FALSE, 'detalle', 'la ejecutó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie con sesión ejecuta record_ai_usage', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_budget(co_a, u_mgr_a, 1000);
        res := res || jsonb_build_object('prueba', 'Ni la gerencia ejecuta set_company_ai_budget por su cuenta: solo el servidor', 'ok', FALSE, 'detalle', 'la ejecutó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Ni la gerencia ejecuta set_company_ai_budget por su cuenta: solo el servidor', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    -- ------------------------------------------------------------ sin sesión
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, TRUE);
    BEGIN
        PERFORM count(*) FROM public.ai_usage_monthly;
        res := res || jsonb_build_object('prueba', 'Sin sesión no se lee el gasto', 'ok', FALSE, 'detalle', 'lo leyó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin sesión no se lee el gasto', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.record_ai_usage(co_a, 1, 0, 1, 0);
        res := res || jsonb_build_object('prueba', 'Sin sesión no se anota gasto', 'ok', FALSE, 'detalle', 'lo anotó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin sesión no se anota gasto', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    EXECUTE 'RESET ROLE';
    SELECT cost_usd INTO v_num FROM public.ai_usage_monthly WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Después de todos los intentos el gasto sigue intacto', 'ok', v_num = 0.000482, 'detalle', v_num);

    RAISE EXCEPTION 'RESULTADOS:%', res::text;
END
$prueba$;
