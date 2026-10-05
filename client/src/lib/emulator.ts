/** Helpers for driving the running EmulatorJS instance (see EmulatorView). */

/** RetroPad Select — PUAE maps it to TOGGLE_VKBD by default (`puae_mapper_select`). */
const RETROPAD_SELECT = 2;

/**
 * Toggle PUAE's on-screen Amiga keyboard by tapping RetroPad Select (the same
 * as pressing V with EmulatorJS's default key bindings). The press is held
 * briefly because the core polls input once per frame. Returns false if the
 * emulator isn't running yet.
 */
export async function toggleVirtualKeyboard(): Promise<boolean> {
  const gm = window.EJS_emulator?.gameManager;
  if (!gm || typeof gm.simulateInput !== 'function') return false;
  gm.simulateInput(0, RETROPAD_SELECT, 1);
  await new Promise((resolve) => setTimeout(resolve, 100));
  gm.simulateInput(0, RETROPAD_SELECT, 0);
  focusEmulator();
  return true;
}

/**
 * Give keyboard focus back to the player. EmulatorJS only listens for keys on
 * its container, so after clicking a button elsewhere on the page physical
 * keys wouldn't reach the game until the user clicked back into it.
 */
export function focusEmulator(): void {
  window.EJS_emulator?.elements?.parent?.focus();
}
