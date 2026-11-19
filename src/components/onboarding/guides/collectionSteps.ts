import type { GuideStep } from '../GuideTour';
import type { CollectionSceneId } from './collectionScenes';

/**
 * The "Tracking payments" guide: 7 steps over three practice scenes (tab-guides-2, requirements
 * sections 6.2 and 12). Each step names the scene that fills its target, so it points at something
 * that is on screen whatever the reader's real Collection holds.
 */
export const COLLECTION_STEPS: GuideStep<CollectionSceneId>[] = [
  {
    target: 'collection-totals',
    title: 'Who owes what',
    content:
      "Collection tracks money from finished sessions only. A session lands here when you finish it on its Summary tab. In this practice you're Ana. Owed to you is what others still have to pay you; You owe is what you still have to pay them.",
    place: 'K1',
  },
  {
    target: 'collection-unsettled',
    title: 'Which one is you?',
    content:
      'Hati finds you by the name in your Profile. In Movie night your name was spelled "Anna", so Hati asks. Open the card, pick your name and confirm, and it moves to the right section.',
    place: 'K1',
  },
  {
    target: 'collection-outstanding',
    title: 'Money still to collect',
    content:
      "Outstanding sessions still have money to collect or pay. Tap a card to open it. Each line is one person: what they owe, what's been paid and what's left.",
    place: 'K1',
  },
  {
    target: 'collection-owed',
    title: 'Record a payment',
    content:
      'When Ben pays you, tap Record payment. It fills in the full amount, so change it if he paid only part. Mark fully paid records the whole amount in one tap. For money you owe, the button says I paid.',
    place: 'K2',
  },
  {
    target: 'collection-owed',
    title: 'Fix a mistake',
    content:
      "Each payment is listed with Undo, in case one was recorded by mistake. Try it on Carla's ₱200: her line goes back to Unpaid.",
    place: 'K2',
  },
  {
    target: 'collection-mark-all',
    title: 'Everyone paid at once?',
    content:
      "Mark all as paid records what's left on every line in this session. Hati asks you to confirm first, and each payment can still be undone.",
    place: 'K2',
  },
  {
    target: 'collection-settled',
    title: 'All done',
    content:
      "When every line is paid, the session moves to Settled. Tap here to see them. That's it: tap Done to go back to your own Collection.",
    place: 'K3',
  },
];
