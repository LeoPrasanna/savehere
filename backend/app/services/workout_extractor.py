import anthropic
import json
from app.config import settings

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
    # Normalize kind: cooking is always step-by-step; otherwise trust the model.
    if is_cooking:
        result["kind"] = "steps"
    elif result.get("kind") != "steps":
        result["kind"] = "tasks"
    result["source"] = "content"
    result["needs_input"] = False
    return result


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
