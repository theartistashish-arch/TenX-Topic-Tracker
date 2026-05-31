export const FOCUS_STATE_KEY = "tenx.focus.state.v1";

/** Set to true while FocusScreen is mounted so OTA reloads are deferred. */
export let focusSessionActive = false;
export function setFocusSessionActive(v: boolean) {
  focusSessionActive = v;
}
