import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Cliente con Service Role para bypass seguro de RLS en tareas de fondo
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface WebhookRecord {
  id: string;
  company_id: string;
  raw_address: string;
  geocoding_status: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE";
  table: string;
  schema: string;
  record: WebhookRecord;
}

async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload: WebhookPayload = await req.json();
    const record = payload.record;

    if (!record || !record.id || !record.raw_address) {
      return new Response(
        JSON.stringify({ message: "Payload missing record id or raw_address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadId = record.id;
    const rawAddress = record.raw_address.trim();
    const addressHash = await computeSha256(rawAddress);

    // 1. Verificación en geocoding_cache (Ahorro de costos Google Maps)
    const { data: cachedHit, error: cacheErr } = await supabase
      .from("geocoding_cache")
      .select("formatted_address, latitude, longitude")
      .eq("address_hash", addressHash)
      .maybeSingle();

    if (cachedHit && !cacheErr) {
      // Incrementar contador de hits en segundo plano
      await supabase.rpc("increment_cache_hit", { p_hash: addressHash });

      // Actualizar Lead mediante RPC PostGIS
      await supabase.rpc("rpc_update_lead_coordinates", {
        p_lead_id: leadId,
        p_latitude: cachedHit.latitude,
        p_longitude: cachedHit.longitude,
        p_formatted_address: cachedHit.formatted_address,
        p_address_hash: addressHash,
      });

      return new Response(
        JSON.stringify({
          status: "success",
          source: "cache",
          leadId,
          coords: { lat: cachedHit.latitude, lng: cachedHit.longitude },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Consulta a Google Maps Geocoding API si no está en caché
    const googleUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    googleUrl.searchParams.set("address", rawAddress);
    googleUrl.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    const geoResponse = await fetch(googleUrl.toString());
    const geoData = await geoResponse.json();

    if (geoData.status !== "OK" || !geoData.results || geoData.results.length === 0) {
      await supabase
        .from("leads")
        .update({
          geocoding_status: "failed",
          geocoding_error: `Google API Error: ${geoData.status} - ${geoData.error_message || "No results"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);

      return new Response(
        JSON.stringify({
          status: "failed",
          error: geoData.status,
          leadId,
          details: geoData.error_message,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firstResult = geoData.results[0];
    const { lat, lng } = firstResult.geometry.location;
    const formattedAddress = firstResult.formatted_address;

    // 3. Guardar en Caché Compartida
    await supabase.from("geocoding_cache").upsert({
      address_hash: addressHash,
      raw_query: rawAddress,
      formatted_address: formattedAddress,
      latitude: lat,
      longitude: lng,
      location: `POINT(${lng} ${lat})`,
      provider: "google_maps",
      response_payload: firstResult,
      hit_count: 1,
      last_hit_at: new Date().toISOString(),
    });

    // 4. Actualizar Lead y Asignar Territorio mediante PostGIS
    await supabase.rpc("rpc_update_lead_coordinates", {
      p_lead_id: leadId,
      p_latitude: lat,
      p_longitude: lng,
      p_formatted_address: formattedAddress,
      p_address_hash: addressHash,
    });

    return new Response(
      JSON.stringify({
        status: "success",
        source: "google_api",
        leadId,
        coords: { lat, lng },
        formattedAddress,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Geocoding unhandled error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
