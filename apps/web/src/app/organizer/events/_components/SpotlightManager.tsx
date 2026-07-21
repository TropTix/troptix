'use client';

import { useState, useTransition } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  PlusCircle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SpotlightItem } from '@troptix/api';
import { spotlightImageUrl } from '@/lib/supabase/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SpotlightImageInput } from './SpotlightImageInput';
import { saveSpotlightAction } from '../_actions/spotlightActions';

const MAX_DESCRIPTION = 350;

// A local, editable spotlight card. `key` is a client-stable list key; the
// server id isn't tracked because saves are a full replace (order = position).
interface EditableCard {
  key: string;
  title: string;
  link: string;
  imageUrl: string | null;
  description: string;
}

function toCard(item: SpotlightItem): EditableCard {
  return {
    key: item.id,
    title: item.title,
    link: item.link ?? '',
    imageUrl: item.imageUrl,
    description: item.description ?? '',
  };
}

function blankCard(): EditableCard {
  return {
    key: crypto.randomUUID(),
    title: '',
    link: '',
    imageUrl: null,
    description: '',
  };
}

// Snapshot excluding `key` (identity) but preserving order — so a reorder or any
// field edit registers as a change, but re-keying after a save does not.
function snapshot(cards: EditableCard[]): string {
  return JSON.stringify(cards.map(({ key: _key, ...rest }) => rest));
}

export function SpotlightManager({
  eventId,
  initial,
}: {
  eventId: string;
  initial: SpotlightItem[];
}) {
  const [cards, setCards] = useState<EditableCard[]>(() => initial.map(toCard));
  const [saved, setSaved] = useState<string>(() =>
    snapshot(initial.map(toCard))
  );
  const [isPending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableCard>(blankCard);

  const dirty = snapshot(cards) !== saved;

  function openAdd() {
    setEditingKey(null);
    setDraft(blankCard());
    setDialogOpen(true);
  }

  function openEdit(card: EditableCard) {
    setEditingKey(card.key);
    setDraft({ ...card });
    setDialogOpen(true);
  }

  function commitDraft() {
    if (draft.title.trim() === '') {
      toast.error('Give the spotlight a title.');
      return;
    }
    setCards((prev) =>
      editingKey
        ? prev.map((c) => (c.key === editingKey ? draft : c))
        : [...prev, draft]
    );
    setDialogOpen(false);
  }

  function removeCard(key: string) {
    setCards((prev) => prev.filter((c) => c.key !== key));
  }

  function move(index: number, delta: number) {
    setCards((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const items = cards.map((c) => ({
        title: c.title,
        link: c.link,
        imageUrl: c.imageUrl,
        description: c.description,
      }));
      const result = await saveSpotlightAction(eventId, items);
      if (result.success && result.spotlight) {
        const fresh = result.spotlight.map(toCard);
        setCards(fresh);
        setSaved(snapshot(fresh));
        toast.success('Spotlight saved.');
      } else {
        toast.error(result.error ?? 'Failed to save spotlight.');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spotlight</CardTitle>
        <CardDescription>
          Feature the DJs, artists, speakers, or sponsors on this event. Each
          card shows an image, name, and links out when you add a link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No spotlight cards yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {cards.map((card, index) => {
              const src = spotlightImageUrl(card.imageUrl);
              return (
                <li
                  key={card.key}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-muted-foreground">
                        {(card.title.trim()[0] ?? '?').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate font-medium">
                      {card.title}
                      {card.link.trim() !== '' && (
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </p>
                    {card.description.trim() !== '' && (
                      <p className="truncate text-sm text-muted-foreground">
                        {card.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === cards.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(card)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCard(card.key)}
                      aria-label="Remove"
                      className="text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={openAdd}
            className="gap-1.5"
          >
            <PlusCircle className="h-4 w-4" /> Add to spotlight
          </Button>
          <Button type="button" onClick={save} disabled={!dirty || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save spotlight
          </Button>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingKey ? 'Edit spotlight' : 'Add to spotlight'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <SpotlightImageInput
              value={draft.imageUrl}
              onChange={(imageUrl) => setDraft((d) => ({ ...d, imageUrl }))}
            />

            <div className="space-y-1.5">
              <Label htmlFor="spotlight-title">Title</Label>
              <Input
                id="spotlight-title"
                value={draft.title}
                maxLength={120}
                placeholder="e.g. DJ Kala"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, title: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spotlight-link">Link</Label>
              <Input
                id="spotlight-link"
                value={draft.link}
                placeholder="instagram.com/djkala"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, link: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Optional. Opens in a new tab.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spotlight-description">Description</Label>
              <Textarea
                id="spotlight-description"
                value={draft.description}
                maxLength={MAX_DESCRIPTION}
                rows={3}
                placeholder="Optional short blurb"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
              />
              <p className="text-right text-xs text-muted-foreground">
                {draft.description.length}/{MAX_DESCRIPTION}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={commitDraft}>
              {editingKey ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
