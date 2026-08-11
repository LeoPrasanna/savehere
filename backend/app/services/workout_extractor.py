import anthropic
import json
import logging
from app.config import settings

logger = logging.getLogger(__name__)
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

WORKOUT_PROMPT = """You are a certified personal trainer AI. Build a workout plan from this fitness content.

Platform: {platform}
Title: {title}
Text: {text}

Return this exact JSON structure:
{{
  "workout_name": "Short punchy name (max 5 words)",
  "difficulty": "beginner|intermediate|advanced",
  "estimated_minutes": 20,
  "exercises": [
    {{
      "name": "Exercise Name",
      "type": "strength|cardio|core|flexibility",
      "muscle_group": "chest|legs|back|core|shoulders|arms|full_body|cardio",
      "sets": 3,
      "reps": 15,
      "duration_seconds": null,
      "rest_seconds": 60,
      "is_estimated": false
    }}
  ]
}}

RULES:
- Extract EXACT numbers when mentioned (e.g. "3 sets of 15" → sets:3, reps:15, is_estimated:false)
- If numbers are NOT mentioned, build a smart workout using the exercises referenced and set is_estimated:true
- IMPORTANT: If content is about a technique or form tip for a specific exercise (e.g. "how to set up dumbbells"), build a full workout FEATURING that exercise as the focus with complementary moves
- Infer muscle groups and exercise type from the exercise name — you are a trainer, use your expertise
- For TIME-based exercises (plank, wall sit, hold): use duration_seconds, set reps:null
- For REP-based exercises (push-ups, squats, curls): use reps, set duration_seconds:null
- rest_seconds defaults: strength=60, cardio=30, core=30, flexibility=15
- difficulty: beginner (<3 sets, basic moves), advanced (>4 sets or complex moves)
- 3 to 8 exercises per plan
- Only return {{"exercises": []}} if the content has ZERO connection to physical exercise (e.g. cooking, tech, news)
- Respond ONLY with the JSON object"""

TASK_PROMPT = """You are a how-to + productivity AI. Read the content and choose the right output:

- If it teaches a PROCEDURE / tutorial / how-to — a sequence meant to be followed IN ORDER (a setup guide, DIY build, technique walkthrough, multi-step method) — output ordered STEPS.
- Otherwise (tips, ideas, motivation, news, concepts, lists) — output high-level actionable TASKS.

Category hint: {category}
Platform: {platform}
Title: {title}
Text: {text}

Return this EXACT JSON structure ("kind" must be "steps" or "tasks"):
{{
  "kind": "steps",
  "tasks": [
    {{ "text": "One action, start with a verb", "emoji": "🔧", "estimated_minutes": 10 }}
  ]
}}

EMOJI GUIDE (pick the best fit):
📚 reading/studying  💻 coding/tech  🍳 cooking  📝 writing/notes  🔍 research
💰 finance  📞 communication  🎯 goal  ⏰ scheduling  🧠 learn concept
🔧 practical/build  🎨 creative  💪 exercise  🧘 mindfulness  📊 analysis  🛒 gather/shop

RULES:
- STEPS: each item is ONE concrete action in the exact order to perform it; 4-15 steps.
- TASKS: 3-8 high-level action items.
- Every item starts with an action verb and is SPECIFIC to THIS content, not generic.
- Each item must be SELF-CONTAINED: include enough context to act on it without rewatching the video (name the tool, setting, ingredient or subject — not a bare "do the next step").
- Be FAITHFUL to the content — use only what's stated; never invent specifics (numbers, settings, names).
- UNITS: when a step states a measurement (temperature, weight, volume, length/size), show BOTH units — keep the one stated, add the equivalent in parentheses, e.g. "375°F (190°C)", "9 in (23 cm)". Round cleanly. Convert real measurements only — never times, counts, ratios, money or %. Same quantity, other unit — never change the original amount.
- estimated_minutes: honest time estimate (5-120 minutes).
- If nothing actionable can be extracted, return {{"kind": "tasks", "tasks": []}}
- Respond ONLY with the JSON object"""

RECIPE_PROMPT = """You are a chef AI. Turn this cooking video into a clear, follow-along recipe the user can cook step by step.

Platform: {platform}
Title: {title}
Text: {text}

Return this exact JSON structure:
{{
  "tasks": [
    {{ "text": "One clear step, starting with a verb", "emoji": "🔪", "estimated_minutes": 5 }}
  ]
}}

Build the list in the exact order you'd cook it:
1. FIRST task: gather ingredients — list every ingredient and quantity MENTIONED, comma-separated (emoji 🛒). If a quantity isn't stated, list the ingredient without one — never invent amounts.
2. THEN one task per cooking step in order: prep (chop/marinate/measure) → cook (heat/mix/simmer) → finish (plate/garnish/serve).

EMOJI per step: 🛒 gather  🔪 prep/chop  🥣 mix/combine  🔥 cook/heat  ⏲️ wait/rest/bake  🧂 season  🍽️ plate/serve

RULES:
- Be FAITHFUL to the content. Use only ingredients, quantities, times and temperatures stated in the text. NEVER invent specifics — a wrong amount or temperature ruins the dish.
- UNITS: show every measurement in BOTH units — keep the one stated, add the equivalent in parentheses: temperatures "375°F (190°C)", weights "1 lb (450 g)" / "8 oz (225 g)", volumes "1 cup (240 ml)" / "2 tbsp (30 ml)" / "1 tsp (5 ml)", sizes "9 in (23 cm)". Round cleanly. Do NOT convert times or servings. Same quantity in another unit — never change the original amount.
- If the video is vague, keep steps at the level of detail actually described. Fewer accurate steps beat many fabricated ones.
- Keep any technique CUE the content states inside its step ("until golden", "low heat", "don't overmix", "rest 5 min") — the cue is often what separates success from failure, so it's the most valuable thing to preserve.
- Each step = ONE action, one concise sentence, starting with a verb (Dice, Heat, Add, Stir, Simmer, Flip, Season, Plate...).
- 4 to 15 steps depending on recipe complexity.
- estimated_minutes: realistic per-step time.
- If this is not actually a recipe / no cooking steps can be extracted, return {{"tasks": []}}
- Respond ONLY with the JSON object"""

RECIPE_INFER_PROMPT = """You are a chef AI. The user saved a cooking video but we could NOT read its actual recipe (no transcript or description). Produce a STANDARD, commonly-made version so they can still cook it.

Dish title: {title}
User's note / what they want: {notes}

Decide:
- If the title OR the user's note clearly identifies a dish you can give a standard recipe for, output common, widely-used, doable steps for it. If the note specifies a style (e.g. "homemade", "desi style", "spicy"), follow that style. Prefer the user's note over the title when both are useful.
- If you CANNOT identify a specific dish (title is vague/generic AND no useful note), return {{"needs_input": true, "tasks": []}}.

Return this EXACT JSON structure:
{{
  "needs_input": false,
  "kind": "steps",
  "tasks": [ {{ "text": "One action, start with a verb", "emoji": "🔪", "estimated_minutes": 5 }} ]
}}

EMOJI per step: 🛒 gather  🔪 prep/chop  🥣 mix/combine  🔥 cook/heat  ⏲️ wait/rest/bake  🧂 season  🍽️ plate/serve

RULES:
- These are GENERAL steps for a common version of the dish (we could not read the actual video) — keep them standard and reasonable, not invented exotic specifics.
- FIRST step gathers the typical ingredients with reasonable common quantities.
- THEN ordered prep -> cook -> finish steps. 5 to 15 steps, each one verb-first sentence.
- UNITS: show every measurement in BOTH units — e.g. "375°F (190°C)", "1 cup (240 ml)", "1 lb (450 g)". Round cleanly; don't convert times or servings.
- If you are not confident which dish it is, return needs_input:true with empty tasks. Do NOT guess a random unrelated dish.
- Respond ONLY with the JSON object"""


ITINERARY_PROMPT = """You are an experienced travel planner. Turn this travel content into a rich, practical trip itinerary the user can actually follow.

Platform: {platform}
Title: {title}
Text: {text}
User's note: {notes}

Return this EXACT JSON structure:
{{
  "trip_name": "Short name (max 6 words)",
  "destination": "Main destination",
  "duration_days": 3,
  "structure_estimated": false,
  "days": [
    {{ "label": "Day 1 — Tokyo", "items": [ {{ "text": "One concrete thing to do/see, verb-first", "emoji": "📍" }} ] }}
  ],
  "tips": ["Short practical tip"]
}}

EMOJI GUIDE: 📍 place/visit  🏔️ nature/trek  🏖️ beach  🍜 food/eat  🛕 culture/temple  🚗 transport  🏨 stay  📸 viewpoint  🎟️ ticket/booking  🛍️ market/shop

BUILD A REAL PLAN — this is the point of the feature:
- The content is your STARTING POINT, not your ceiling. Take the destinations, trip length and any stated plan from it, then use your own knowledge of those places to build a genuinely useful day-by-day itinerary.
- Name real, specific, well-known places — neighbourhoods, landmarks, temples, markets, viewpoints, districts. "Visit Senso-ji temple in Asakusa" is a real plan; "Explore Tokyo" is not. Never leave a day as a single vague stop when you know the destination.
- Aim for 3 to 5 items per day: a mix of a headline sight, something to eat or drink, and a neighbourhood or experience. Sequence each day so the stops are geographically sensible rather than criss-crossing the city.
- Anything stated in the content or the user's note takes PRIORITY and must appear. Your own additions fill the gaps around it, never replace it.
- If the content states its own day plan, follow it exactly and set "structure_estimated": false. If you organised the days yourself, set "structure_estimated": true.
- "duration_days": the number stated in the content, else the length of your plan.

ACCURACY — the one hard limit:
- Do NOT state exact prices, opening hours, admission fees, booking requirements or travel times as fact. You cannot verify them and a wrong one sends someone to a closed door or blows their budget. Write "check current opening hours" or "book ahead in peak season" instead of inventing a number or a time.
- EXCEPTION: if the content or the user's note states a price, time or booking detail, repeat it exactly as given.
- Only name places you are genuinely confident exist. A famous landmark is fine; do not invent a restaurant name to fill a slot.
- Use the standard spelling of a well-known real place if the content misspells it ("Hiroahima" → "Hiroshima").

LIMITS: 1 to 14 days; 3 to 6 items per day; 0 to 6 tips. Tips should be practical and destination-specific — best season, getting around, what to book early, local etiquette.
(The per-day ceiling is 6 rather than 10 to keep a 14-day plan inside the output token budget — a plan that overruns is a charged failure, not a longer plan.)

If the content names no destination at all and you cannot tell where the trip is, return {{"days": []}}.
Respond ONLY with the JSON object"""


def _parse_model_json(raw_text: str, fallback: dict) -> dict:
    """Strip optional code fences and parse JSON; return fallback on failure."""
    raw = (raw_text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def extract_workout(platform: str, title: str, text: str) -> dict:
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        messages=[{
            "role": "user",
            "content": WORKOUT_PROMPT.format(
                platform=platform,
                title=title,
                text=text[:3000],
            ),
        }],
    )

    return _parse_model_json(msg.content[0].text, {"exercises": []})


def extract_tasks(platform: str, title: str, text: str, category: str, notes: str = "") -> dict:
    """
    Returns a dict with: kind ("steps"|"tasks"), tasks[], source
    ("content"|"title"|"notes"), needs_input (bool).
    - Cooking with no usable content falls back to inferring a general recipe from
      the user's note or the title (clearly flagged via "source").
    - Everything else extracts from the content (or notes/title as a thin fallback).
    """
    is_cooking = (category or "").lower() == "cooking"
    content = (text or "").strip()
    has_content = len(content) >= 50

    if is_cooking and not has_content:
        return _infer_recipe(title=title or "", notes=notes or "")

    # Normal path. For non-cooking, allow notes/title to stand in as thin content.
    effective_text = content or (notes or "").strip() or (title or "")
    prompt = RECIPE_PROMPT if is_cooking else TASK_PROMPT

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1400 if is_cooking else 1100,   # steps/recipes have more, finer items
        messages=[{
            "role": "user",
            "content": prompt.format(
                platform=platform,
                title=title,
                text=effective_text[:3000],
                category=category or "general",
            ),
        }],
    )

    result = _parse_model_json(msg.content[0].text, {"tasks": []})
    if not isinstance(result.get("tasks"), list):
        result["tasks"] = []
    # Caption said "recipe in comments" or similar — no actual steps extracted.
    # Fall through to title-based inference so the user still gets something useful.
    if is_cooking and not result.get("tasks"):
        return _infer_recipe(title=title or "", notes=notes or "")
    # Normalize kind: cooking is always step-by-step; otherwise trust the model.
    if is_cooking:
        result["kind"] = "steps"
    elif result.get("kind") != "steps":
        result["kind"] = "tasks"
    result["source"] = "content"
    result["needs_input"] = False
    return result


def extract_itinerary(platform: str, title: str, text: str, notes: str = "") -> dict:
    """Build a trip itinerary from travel content. Returns
    {trip_name, destination, duration_days, structure_estimated, days[], tips[]}
    with days=[] when no destination could be determined at all.

    ⚠️ Owner decision 2026-08-11: this is the ONE extractor that is deliberately
    NOT grounded-only. Everywhere else in the app (summaries, recipes, workouts)
    AI output must come from the saved content — see CLAUDE.md quality bar #5.
    Here it produced useless plans: a title-only travel reel yielded "Explore
    Tokyo" for every day, because the old prompt banned adding anything the reel
    had not named. Claude now supplements the reel with its own knowledge of the
    destination. Content still takes priority and must appear; the residual guard
    is that unverifiable SPECIFICS (prices, opening hours, booking rules) must
    not be stated as fact, since a wrong one sends someone to a closed door.
    `structure_estimated` still flags a day grouping the model invented."""
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        # 1400 was too small the moment the prompt started asking for 3-5 items a
        # day: a 10-day plan overran it, the truncated JSON failed to parse, and
        # _parse_model_json's fallback surfaced as a 422 "no itinerary" AFTER the
        # user's AI action had already been charged.
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": ITINERARY_PROMPT.format(
                platform=platform,
                title=title,
                text=(text or "")[:3000],
                notes=(notes or "").strip()[:500] or "(none)",
            ),
        }],
    )

    if msg.stop_reason == "max_tokens":
        # Loud and retryable, never silently downgraded to "no itinerary" — that
        # told the user their reel was unusable when the real fault was our cap.
        logger.error(
            f"[ITINERARY] hit max_tokens for {platform} title={title[:60]!r} — raise the cap"
        )
        raise RuntimeError("itinerary truncated at max_tokens")

    result = _parse_model_json(msg.content[0].text, {"days": []})

    # Normalize defensively — this JSON is stored and rendered as-is, so a
    # malformed model reply must degrade to "nothing extracted", never a crash.
    days = result.get("days")
    if not isinstance(days, list):
        days = []
    clean_days = []
    for i, day in enumerate(days[:14]):
        if not isinstance(day, dict):
            continue
        items = day.get("items")
        if not isinstance(items, list):
            continue
        clean_items = [
            {"text": it["text"].strip(), "emoji": it.get("emoji") or "📍"}
            for it in items[:10]
            if isinstance(it, dict) and isinstance(it.get("text"), str) and it["text"].strip()
        ]
        if clean_items:
            label = day.get("label")
            clean_days.append({
                "label": label.strip() if isinstance(label, str) and label.strip() else f"Day {i + 1}",
                "items": clean_items,
            })

    tips = result.get("tips")
    clean_tips = [t.strip() for t in tips[:6] if isinstance(t, str) and t.strip()] if isinstance(tips, list) else []

    duration = result.get("duration_days")
    return {
        "trip_name": result.get("trip_name") if isinstance(result.get("trip_name"), str) else "Trip Plan",
        "destination": result.get("destination") if isinstance(result.get("destination"), str) else None,
        "duration_days": duration if isinstance(duration, int) and 0 < duration <= 14 else None,
        "structure_estimated": bool(result.get("structure_estimated", False)),
        "days": clean_days,
        "tips": clean_tips,
    }


def _infer_recipe(title: str, notes: str) -> dict:
    """Infer a general recipe from the user's note (preferred) or the title."""
    basis = "notes" if len(notes.strip()) >= 3 else "title"
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1400,
        messages=[{
            "role": "user",
            "content": RECIPE_INFER_PROMPT.format(
                title=title or "(none)",
                notes=notes.strip() or "(none)",
            ),
        }],
    )
    result = _parse_model_json(msg.content[0].text, {"needs_input": True, "tasks": []})
    tasks = result.get("tasks")
    if result.get("needs_input") or not isinstance(tasks, list) or not tasks:
        return {"kind": "steps", "tasks": [], "needs_input": True, "source": basis}
    return {"kind": "steps", "tasks": tasks, "needs_input": False, "source": basis}
