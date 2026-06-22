import { categoryMeta, colors } from './theme';

export type Feature = { icon: string; color: string; title: string; desc: string; detail: string };

// Everything SaveHere can do — shown on the landing FAQ and the "What you can do" tab.
export const FEATURES: Feature[] = [
  {
    icon: 'fitness',
    color: categoryMeta.fitness.color,
    title: 'Save a workout reel',
    desc: 'Recreate it as a guided plan.',
    detail: 'Save any gym or fitness reel, then tap "Build Workout". SaveHere turns it into a structured plan — exercises with sets, reps and rest timers. Tweak the numbers, then hit Start for a hands-free, step-by-step session with countdowns.',
  },
  {
    icon: 'cooking',
    color: categoryMeta.cooking.color,
    title: 'Save a cooking reel',
    desc: 'Turn it into a step-by-step recipe.',
    detail: 'Save a recipe reel and tap "Get Recipe". We pull out the ingredients and lay out numbered, cook-along steps you can tick off. If the video can’t be read, jot the gist into Notes and we’ll structure it into a recipe for you.',
  },
  {
    icon: 'education',
    color: categoryMeta.education.color,
    title: 'Save a how-to or lesson',
    desc: 'Get an actionable checklist.',
    detail: 'Save a tutorial, course clip or how-to. Tap "Get Action Steps" and we break it into an ordered, tickable checklist — so you actually do what the video teaches instead of just watching it.',
  },
  {
    icon: 'search',
    color: '#5BC0FF',
    title: 'Find anything fast',
    desc: 'Search titles, summaries, tags & notes.',
    detail: 'The search bar matches your titles, AI summaries, tags AND your own notes — so you can find that one thing you saved even if you only remember a small detail from it.',
  },
  {
    icon: 'ask',
    color: colors.accent,
    title: 'Ask your library',
    desc: 'Get answers from your own saves.',
    detail: 'Ask a question like "what was that high-protein recipe?" and SaveHere answers using ONLY your saved items — then shows you which ones it used. Your personal, searchable second brain.',
  },
  {
    icon: 'rediscover',
    color: '#FF8A5B',
    title: 'Rediscover old saves',
    desc: 'Resurface things worth a second look.',
    detail: 'Saved-and-forgotten is the enemy. Rediscover surfaces a few past saves so they don’t rot in a pile — revisit them, act on them, or clear them out.',
  },
  {
    icon: 'sparkles',
    color: colors.accentLight,
    title: 'Save anything else',
    desc: 'AI summary, tags & your notes.',
    detail: 'Every save gets a concise AI summary of the key points, smart tags for filtering, and a Notes field for your own thoughts. Not happy with a summary? Re-summarize or edit it anytime — you’re always in control.',
  },
];
