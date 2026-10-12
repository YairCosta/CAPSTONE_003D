# Capturas de evidencia

Las capturas que cita el [índice de evidencias (REV-09)](../Archivos%20Word/09_Indice_de_Evidencias.docx). Cada una
lleva la fecha y la hora en que se tomó, y el comando o la página que la produce.

| N.º | Archivo | Qué muestra | Cómo verificarlo |
|---|---|---|---|
| E1 | `E1_tablero_scrumban.png`, `E1b_tablero_columnas.png` | Tablero Scrumban en GitHub Projects | <https://github.com/users/YairCosta/projects/1> |
| E2 | `E2_historial_git.png` | Historial de Git de las iteraciones 5 y 6 (repositorio de producción) | `git log --since=2026-09-30` |
| E3 | `E3_pruebas_asistente_por_tema.png` | Pruebas del asistente de IA, por tema (69 de 69) | `npm run test:ai` |
| E4 | `E4_pruebas_asistente_detalle.png` | Detalle de las 69 pruebas del asistente | `npm run test:ai` |
| E5 | `E5_pruebas_base_de_datos.png` | Pruebas contra la base de Supabase real (335 de 335) | `npm run test:db` |
| E6 | `E6_resumen_de_suites.png` | Resto de las suites de pruebas | Cada comando figura en la captura |
| E7 | `E7_migraciones_aplicadas.png` | Migraciones aplicadas en Supabase (34 de 34) | `npx supabase migration list` |
| E8 | `E8_app_publicada_demo.png` | App publicada, con la demo pública | <https://revela-henna.vercel.app/?demo> |
| E9 | `E9_landing_publicada.png` | Landing publicada | <https://revela-landing-iota.vercel.app> |

Las capturas E2, E5 y E7 salen del repositorio de producción y de la base real, que no forman parte de esta copia de
evaluación; por eso sus comandos se muestran en la captura.
