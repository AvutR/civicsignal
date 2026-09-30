import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {cleanupHandler} from './handler.js';

// Invoke on a schedule with the service-role credential in the Authorization header.
// Never place that credential in browser configuration or public repository variables.
Deno.serve(cleanupHandler({url:Deno.env.get('SUPABASE_URL'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),createClient}));
