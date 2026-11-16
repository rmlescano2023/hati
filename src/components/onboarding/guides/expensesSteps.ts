import type { GuideStep } from '../GuideTour';
import type { ExpensesSceneId } from './expensesScenes';

/**
 * The "Logging expenses" guide: 17 steps over four practice scenes (tab-guides, requirements
 * section 6.1). Each step names the scene that fills its target, so it points at something that
 * is on screen even though the real session it was started from may be empty.
 */
export const EXPENSES_STEPS: GuideStep<ExpensesSceneId>[] = [
  {
    target: 'group-members',
    title: "Who's sharing?",
    content:
      "This is a practice with made-up people, so tap and type freely: nothing here is saved. Start by adding everyone who's sharing the costs. Type a name and tap + Add. Tap × on a name to remove it.",
    place: 'X1',
  },
  {
    target: 'purchase-date',
    title: 'When was it?',
    content:
      'Pick the day of the purchase. It starts on today.',
    place: 'X1',
  },
  {
    target: 'paid-by',
    title: 'Who paid?',
    content:
      'Choose who paid at the counter. Here, Ana paid.',
    place: 'X1',
  },
  {
    target: 'paid-by',
    title: 'More than one payer?',
    content:
      'If several people paid, switch to Multiple Payors and type what each one put in. Ana paid ₱700 and Ben ₱500. Together they have to match the price.',
    place: 'X2',
  },
  {
    target: 'item-name',
    title: 'What was bought?',
    content:
      "Give it a name you'll recognise later, and type the total price.",
    place: 'X2',
  },
  {
    target: 'equal-owners',
    title: 'Split it evenly',
    content:
      "Equal Split shares the price evenly between the people ticked. Dino wasn't in on the groceries, so Ana, Ben and Carla pay ₱400 each. All Members ticks everyone at once.",
    place: 'X2',
  },
  {
    target: 'item-mode',
    title: 'Different orders?',
    content:
      "When people had different things, like at a restaurant, switch to Custom Amounts and type the receipt as it's printed.",
    place: 'X3',
  },
  {
    target: 'custom-total',
    title: 'The receipt total',
    content:
      "Type the total at the bottom of the receipt. Hati uses it to check that nothing's missing.",
    place: 'X3',
  },
  {
    target: 'who-in-item',
    title: "Who's at the table?",
    content:
      'Tick everyone in this item. Each person gets their own box below.',
    place: 'X3',
  },
  {
    target: 'sub-items',
    title: 'What each person had',
    content:
      'Type what each person ordered and its price. Ben had two things, so he used + Add sub-item for the second. The amount beside each name is what that person pays.',
    place: 'X3',
  },
  {
    target: 'bill-shared',
    title: 'Shared dishes',
    content:
      'A dish people shared goes here. Hati splits it between the people ticked. Everyone shared the rice platter.',
    place: 'X3',
  },
  {
    target: 'bill-discounts',
    title: 'Discounts',
    content:
      'A discount, like PWD or senior, comes off only the share of the people ticked. Dino gets the senior discount.',
    place: 'X3',
  },
  {
    target: 'bill-charges',
    title: 'Charges',
    content:
      "A service charge or delivery fee goes here. It's split equally across everyone in the item.",
    place: 'X3',
  },
  {
    target: 'custom-figures',
    title: 'Does it add up?',
    content:
      "Entered is what you've typed so far. It turns red, with \"of\" and the receipt total, until the two match. Dino's order is still blank, so ₱120 is missing. Fill Remainder, next to the total at the top, gives what's missing to whoever is still blank.",
    place: 'X3',
  },
  {
    target: 'add-item',
    title: 'Add it to the list',
    content:
      'When the item looks right, tap + Add Item. It waits in the list below, so you can add several before saving.',
    place: 'X3',
  },
  {
    target: 'staged-list',
    title: 'Check before saving',
    content:
      "Everything you've added waits here. Tap the pencil to load an item back into the form and change it, or × to take it out.",
    place: 'X4',
  },
  {
    target: 'save-to-breakdown',
    title: 'Save it',
    content:
      "Tap Save to Breakdown to save everything in the list to the session. That's it: tap Done to go back to your own session.",
    place: 'X4',
  },
];
