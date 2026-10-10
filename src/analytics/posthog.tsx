// PostHog is the only analytics (meta/POSTHOG.md). Rendered on the server from the
// runtime environment; when no key is configured nothing is emitted, so local
// previews stay silent. VITE_ is the public prefix check-launch-readiness looks for.
const KEY = process.env.VITE_POSTHOG_KEY;
const HOST = process.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

const key = KEY && /^phc_[A-Za-z0-9]+$/.test(KEY) ? KEY : null;
const host = /^https:\/\/[a-z0-9.-]+$/i.test(HOST) ? HOST : 'https://eu.i.posthog.com';

const LOADER =
  '!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);';

export function Analytics() {
  if (!key) return null;
  // Register the app on load; the send hook also tags the initial pageview and
  // events queued before that callback, keeping archived Crew traffic separate.
  const init = `posthog.init('${key}',{api_host:'${host}',defaults:'2026-01-30',person_profiles:'identified_only',autocapture:false,disable_session_recording:true,capture_pageview:true,capture_exceptions:true,persistence:'memory',ip:false,loaded:function(ph){ph.register({app:'stillness'});},before_send:function(event){if(event){event.properties.app='stillness';}return event;}});`;
  return <script dangerouslySetInnerHTML={{ __html: LOADER + init }} />;
}
