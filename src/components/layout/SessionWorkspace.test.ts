import { describe, expect, it } from 'vitest';
import { EDIT_ITEM_MESSAGE } from './SessionWorkspace';

describe('the "Edit item" prompt (bill-ux-polish-2 item 6)', () => {
  it('tells the user where Cancel leads', () => {
    expect(EDIT_ITEM_MESSAGE).toBe(
      'It opens on the Expenses tab with its date and Paid By. Breakdown keeps it as it is until you press Save Edits. Cancel brings you back to Breakdown.',
    );
  });
});
