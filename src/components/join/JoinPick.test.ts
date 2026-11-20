import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JoinPick } from './JoinPick';
import { PracticeProfileProvider } from '../../context/ProfileContext';
import type { InvitePreview } from '../../types';

/**
 * The join dialog's two views, rendered through the practice profile, whose name is "Ana". The
 * organizer is "Zed" here and is never in the preview's members.
 */

const preview = (over: Partial<InvitePreview> = {}): InvitePreview => ({
  sessionId: 'session_1',
  title: 'Bali Trip',
  closedAt: '2026-11-02T00:00:00.000Z',
  members: ['Ana', 'Ben', 'Carla'],
  memberCount: 4,
  onHati: [],
  organizerName: 'Rina',
  ...over,
});

const render = (over: Partial<InvitePreview> = {}, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(PracticeProfileProvider, {
      children: createElement(JoinPick, {
        preview: preview(over),
        busy: false,
        error: null,
        onJoin: () => {},
        onCancel: () => {},
        ...props,
      }),
    }),
  )
    .replace(/&#x27;/g, "'")
    .replace(/<!-- -->/g, '');

describe('the join prompt (round 4)', () => {
  it('is a confirm for the one member the profile name matches, with Join and a Not you link', () => {
    const markup = render();
    expect(markup).toContain('Join “Bali Trip” as Ana?');
    expect(markup).toContain('>Not Ana?<');
    expect(markup).toContain('aria-label="Not Ana? Choose another member"');
    expect(markup).not.toContain('type="radio"');
    expect(markup).not.toContain('Which one are you?');
    expect(markup).toContain('>Join<');
    expect(markup).toContain('data-join=""');
  });

  it('keeps the highlighted sharer, the date and the member count (the organizer included)', () => {
    const markup = render();
    expect(markup).toMatch(/<strong class="[^"]*sharer[^"]*">Rina<\/strong> shared this session\./);
    expect(markup).toContain('· 4 members');
  });

  it('shows the list after "Not you?", with nothing selected', () => {
    const markup = render({}, { startWithList: true });
    expect(markup).toContain('Join “Bali Trip”?');
    expect(markup).toContain('Which one are you?');
    expect(markup).toContain('type="radio"');
    expect(markup).not.toContain('checked');
    expect(markup).not.toContain('Not Ana?');
    expect(markup).toMatch(
      /<button[^>]*disabled[^>]*>Join<\/button>|disabled=""[^>]*data-join|data-join=""[^>]*disabled/,
    );
  });

  it('shows the list when nobody matches, and never lists the organizer', () => {
    const markup = render({ members: ['Ben', 'Carla'] });
    expect(markup).toContain('Which one are you?');
    expect(markup).toContain('value="Ben"');
    expect(markup).toContain('value="Carla"');
    expect(markup).not.toContain('value="Zed"');
    expect(markup).not.toContain('Zed');
  });

  it('shows the list when the match is ambiguous', () => {
    const markup = render({ members: ['Ana', 'ana', 'Ben'] });
    expect(markup).toContain('Which one are you?');
    expect(markup).not.toContain('Not Ana?');
  });

  it('never matches a member already joined, which is listed greyed and marked on Hati', () => {
    const markup = render({ members: ['Ana', 'Ben'], onHati: ['Ana'] });
    expect(markup).toContain('Which one are you?');
    expect(markup).toContain('Ana · on Hati');
    expect(markup).toMatch(
      /<input[^>]*value="Ana"[^>]*disabled=""|<input[^>]*disabled=""[^>]*value="Ana"/,
    );
    expect(markup).toContain('Is your name taken?');
  });

  it('reads Joining… and disables Join while the request is in flight', () => {
    const markup = render({}, { busy: true });
    expect(markup).toContain('Joining…');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Joining…/);
  });

  it('shows an error line under the view', () => {
    expect(
      render({}, { error: 'Someone else just joined as Ben. Pick who you are again.' }),
    ).toContain('role="alert"');
  });

  it('centres the confirm view only, and leaves the list view alone', () => {
    expect(render()).toMatch(/class="[^"]*centred/);
    expect(render({}, { startWithList: true })).not.toMatch(/centred/);
    expect(render({ members: ['Ben', 'Carla'] })).not.toMatch(/centred/);
  });

  it('keeps the two body paragraphs left-aligned while the rest is centred', () => {
    const markup = render();
    expect(markup).toMatch(
      /<p class="[^"]*bodyText[^"]*"><strong[^>]*>Rina<\/strong> shared this session\./,
    );
    expect(markup).toMatch(/<p class="[^"]*bodyText[^"]*">You can see the whole session/);
    expect((markup.match(/bodyText/g) ?? []).length).toBe(2);
  });
});
