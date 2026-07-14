"use client";

import { useEffect, useState } from "react";
import { addAreaAlert, addPinComment, fetchPinSocial, ratePin } from "@/lib/data";
import {
  BHK_COLORS,
  daysAgo,
  PinComment,
  RatingSummary,
  RentPin,
} from "@/lib/types";

interface Props {
  pin: RentPin;
  onClose: () => void;
  onReport: (pinId: string) => void;
  onRated: (pinId: string, stars: number) => void;
  onSeeAvailable: () => void;
}

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

function pinRating(pin: RentPin): RatingSummary {
  return {
    count: pin.rating_count,
    avg: pin.rating_count > 0 ? pin.rating_sum / pin.rating_count : null,
  };
}

export default function PinCard({
  pin,
  onClose,
  onReport,
  onRated,
  onSeeAvailable,
}: Props) {
  const [rating, setRating] = useState<RatingSummary>(pinRating(pin));
  const [comments, setComments] = useState<PinComment[]>([]);
  const [socialError, setSocialError] = useState(false);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [hoverStar, setHoverStar] = useState(0);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [alertEmail, setAlertEmail] = useState("");
  const [alertState, setAlertState] = useState<"idle" | "saving" | "done" | "error">(
    "idle"
  );

  const ratedKey = `bombayrent_rated_${pin.id}`;

  useEffect(() => {
    let cancelled = false;
    setRating(pinRating(pin));
    setComments([]);
    setSocialError(false);
    setComment("");
    setCommentError(null);
    setAlertEmail("");
    setAlertState("idle");
    setMyRating(
      typeof window === "undefined"
        ? null
        : Number(window.localStorage.getItem(ratedKey)) || null
    );
    fetchPinSocial(pin.id)
      .then((s) => {
        if (cancelled) return;
        // Keep the pin's cached aggregate when the fetch has less data
        // (demo-mode seed pins have baked-in ratings, no rating rows).
        if (s.rating.count >= pin.rating_count) setRating(s.rating);
        setComments(s.comments);
      })
      .catch(() => !cancelled && setSocialError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.id]);

  const handleRate = async (stars: number) => {
    if (myRating) return; // one rating per browser
    setMyRating(stars);
    window.localStorage.setItem(ratedKey, String(stars));
    try {
      await ratePin(pin.id, stars);
      setRating((r) => ({
        count: r.count + 1,
        avg: ((r.avg ?? 0) * r.count + stars) / (r.count + 1),
      }));
      onRated(pin.id, stars); // updates the ★ on the map dot too
    } catch {
      setMyRating(null);
      window.localStorage.removeItem(ratedKey);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = comment.trim();
    if (!body) return;
    setPosting(true);
    setCommentError(null);
    try {
      const created = await addPinComment(pin.id, body);
      setComments((c) => [created, ...c]);
      setComment("");
    } catch (err) {
      setCommentError(
        err instanceof Error ? err.message : "Comment failed — try again."
      );
    } finally {
      setPosting(false);
    }
  };

  const handleAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alertEmail)) return;
    setAlertState("saving");
    try {
      await addAreaAlert(pin.lat, pin.lng, alertEmail.trim());
      setAlertState("done");
    } catch {
      setAlertState("error");
    }
  };

  const chips: string[] = [
    pin.bhk,
    pin.housing_type,
    ...(pin.furnishing ? [pin.furnishing === "Furnished" ? "🛋 Furnished" : "📦 Unfurnished"] : []),
    ...(pin.maintenance_included === true ? ["Maintenance included"] : []),
    ...(pin.maintenance_included === false ? ["Maintenance extra"] : []),
    ...(pin.gated === true ? ["🏘 Gated society"] : []),
    ...(pin.gated === false ? ["🚪 Not gated"] : []),
    ...(pin.tenant_type ? [pin.tenant_type === "Family" ? "👨‍👩‍👧 Family" : "🎓 Bachelor"] : []),
    ...(pin.pets === "Yes" ? ["🐕 Pets OK"] : []),
    ...(pin.pets === "No" ? ["🚫 No pets"] : []),
    ...(pin.parking_count != null
      ? [pin.parking_count === 0 ? "No parking" : `🚗 ${pin.parking_count} parking`]
      : []),
    ...(pin.sqft ? [`${pin.sqft} sq.ft`] : []),
  ];

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 max-h-[72vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-20 sm:w-[340px] sm:rounded-2xl">
      <div className="sticky top-0 flex items-start justify-between gap-2 border-b border-slate-100 bg-white p-4 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Monthly rent
          </p>
          <p className="text-2xl font-extrabold text-slate-900">
            {inr(pin.rent)}
            <span className="text-sm font-medium text-slate-400">/month</span>
          </p>
          {pin.deposit != null && (
            <p className="text-xs text-slate-500">Deposit: {inr(pin.deposit)}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onReport(pin.id)}
            title="Flag as wrong or spam"
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100"
          >
            🚩
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <span
              key={i}
              className="rounded-md px-2 py-1 text-[11px] font-semibold"
              style={
                i === 0
                  ? { background: BHK_COLORS[pin.bhk], color: "#fff" }
                  : { background: "#f1f5f9", color: "#475569" }
              }
            >
              {c}
            </span>
          ))}
        </div>

        {pin.society && (
          <p className="text-xs text-slate-600">
            Society: <span className="font-semibold">{pin.society}</span>
          </p>
        )}
        {pin.note && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
            “{pin.note}”
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Pinned {daysAgo(pin.created_at)}</span>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-700 hover:underline"
          >
            Get directions 📍
          </a>
        </div>

        <div className="rounded-xl bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-800">Not for rent</p>
          <p className="mt-0.5 text-[11px] leading-snug text-amber-700">
            This person pinned their rent for transparency — they&apos;re not
            renting it out.
          </p>
          <button
            onClick={onSeeAvailable}
            className="mt-1.5 text-xs font-semibold text-amber-900 underline"
          >
            See flats currently available →
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-700">
            🔔 Be the first to know when a flat opens here
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            One free email the moment a place lists within 1&nbsp;km.
          </p>
          {alertState === "done" ? (
            <p className="mt-2 text-xs font-semibold text-emerald-700">
              ✓ You&apos;re on the list.
            </p>
          ) : (
            <form onSubmit={handleAlert} className="mt-2 flex gap-1.5">
              <input
                type="email"
                required
                value={alertEmail}
                onChange={(e) => setAlertEmail(e.target.value)}
                placeholder="you@gmail.com"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={alertState === "saving"}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                →
              </button>
            </form>
          )}
          {alertState === "error" && (
            <p className="mt-1 text-[11px] text-red-600">
              Could not subscribe — try again.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-slate-700">Community rating</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  disabled={!!myRating}
                  onClick={() => handleRate(s)}
                  onMouseEnter={() => setHoverStar(s)}
                  onMouseLeave={() => setHoverStar(0)}
                  className="px-0.5 text-lg disabled:cursor-default"
                >
                  {s <= (hoverStar || myRating || Math.round(rating.avg ?? 0))
                    ? "★"
                    : "☆"}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              {rating.count > 0
                ? `${(rating.avg ?? 0).toFixed(1)} (${rating.count})`
                : "No ratings yet — tap to rate"}
            </span>
          </div>
          {myRating && (
            <p className="text-[11px] text-slate-400">You rated {myRating}★</p>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-slate-700">
            Comments {comments.length > 0 && `(${comments.length})`}
          </p>
          {socialError && (
            <p className="mt-1 text-[11px] text-slate-400">
              Couldn&apos;t load comments.
            </p>
          )}
          <div className="mt-1.5 space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-700">{c.body}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {daysAgo(c.created_at)}
                </p>
              </div>
            ))}
          </div>
          <form onSubmit={handleComment} className="mt-2 flex gap-1.5">
            <input
              type="text"
              maxLength={280}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={posting || !comment.trim()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Post
            </button>
          </form>
          {commentError && (
            <p className="mt-1 text-[11px] text-red-600">{commentError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
