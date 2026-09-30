import {config} from './config.js';

export const sharedMode = Boolean(config.supabaseUrl || config.supabasePublishableKey);
let client;
async function getClient() {
  if (!sharedMode) throw new Error('The shared backend has not been configured.');
  if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('Backend configuration is incomplete. Set both the project URL and publishable key.');
  if (!client) {
    const {createClient} = await import('./vendor/supabase.js');
    client = createClient(config.supabaseUrl, config.supabasePublishableKey);
  }
  return client;
}
function checked(result) {
  if (result.error) throw new Error(result.error.message || 'The server could not complete this request.');
  return result.data;
}
export async function account() {
  const api = await getClient();
  const {session} = checked(await api.auth.getSession());
  if (!session) return {user:null, reviewer:false};
  const {user} = checked(await api.auth.getUser());
  return {user, reviewer:checked(await api.rpc('is_reviewer'))};
}
export async function onAuthChange(callback) {
  const api = await getClient();
  return api.auth.onAuthStateChange(event => {
    // Run outside the SDK auth lock; do not await another auth call in this callback.
    if (event !== 'INITIAL_SESSION') setTimeout(() => callback(event), 0);
  });
}
export async function signIn(email, password) {
  return checked(await (await getClient()).auth.signInWithPassword({email,password}));
}
export async function signUp(email, password) {
  return checked(await (await getClient()).auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}));
}
export async function signOut() { checked(await (await getClient()).auth.signOut()); }
export async function resetPassword(email) {
  checked(await (await getClient()).auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname}));
}
export async function changePassword(password) {checked(await (await getClient()).auth.updateUser({password}));}
export async function listReports() {
  const api = await getClient();
  const result = [];
  let cursor = null;
  // Stable cursor pagination: never silently truncate at Supabase's default row limit.
  for (;;) {
    const page = checked(await api.rpc('list_reports',{p_before:cursor}));
    result.push(...page);
    if (page.length < 200) return result;
    cursor = page.at(-1).id.slice(3);
    if (result.length >= 10000) throw new Error('This pilot exceeds 10,000 reports. Ask the operator to add server-side filtering before continuing.');
  }
}
export async function createReport(report) {
  return checked(await (await getClient()).rpc('create_report',{p_report:report}));
}
export async function updateStatus(report, status, note) {
  return checked(await (await getClient()).rpc('review_report',{p_id:report.id.slice(3),p_status:status,p_note:note,p_revision:report.revision}));
}
export async function deleteReport(report) {
  checked(await (await getClient()).rpc('delete_report',{p_id:report.id.slice(3),p_revision:report.revision}));
}
export async function reportHistory(id) {
  return checked(await (await getClient()).rpc('report_history',{p_id:id.slice(3)}));
}
