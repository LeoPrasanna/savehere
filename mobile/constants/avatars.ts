/**
 * Profile avatars — 92 illustrated PNGs, owner-supplied (2026-08-10),
 * replacing the emoji list that shipped before.
 *
 * ── TEN WERE REMOVED FROM THE SUPPLIED SET, DO NOT PUT THEM BACK ───────────
 * They were recognisable third-party characters despite generic filenames, and
 * shipping them as selectable avatars in an App Store app is a trademark
 * problem (App Review 5.2), not a style one:
 *   19_tiny_green_creature (Grogu)   20_blue_creature (Stitch)
 *   21_groot_like_plant (Groot)      22_yellow_mouse (Pikachu)
 *   24_pink_blob (Kirby)             25_blue_turtle (Squirtle)
 *   26_fox_rabbit (Eevee)            27_pink_cat (Mew)
 *   35_game_controller (Xbox trade dress)  36_gameboy (Nintendo hardware)
 * This is the same exposure that got every bitmap pulled from the login screen
 * in round three.
 * ⚠️ Removing keys is why `isLegacyAvatar` checks the SHAPE of the value and
 * not just "is it missing from the map". A user who had picked `22_yellow_mouse`
 * now holds a key that resolves to nothing; the emoji fallback would have
 * printed the literal string "22_yellow_mouse" into their avatar box.
 *
 * ── ON BUNDLE SIZE, WHICH IS THE REASON THIS FILE READS LIKE THIS ──────────
 * The originals are 512x512 RGBA, 15.9 MB for the set. Expo bundles everything
 * under assets/ into the binary AND the web build, so that would have more than
 * quadrupled a 5.1 MB app for artwork that never renders above 64pt. They are
 * committed at 128px (2x the largest on-screen use, 3x the picker cell) and
 * palette-quantized: **0.47 MB for all 102, ~4.5 KB each — a 97% reduction**
 * with no visible loss at render size. Regenerate with the script noted in
 * TODO.md if the source art changes; do NOT drop 512px files in here.
 *
 * ── WHY A STATIC MAP AND NOT A LOOP ────────────────────────────────────────
 * Metro resolves `require` at BUILD time from a string literal. A computed
 * path (`require(`../assets/avatars/${key}.png`)`) does not bundle the asset
 * and throws at runtime on native. Every entry has to be spelled out, so this
 * file is generated rather than hand-written.
 *
 * ── KEYS KEEP THEIR NUMERIC PREFIX ─────────────────────────────────────────
 * Five descriptive names repeat across the set (two robots, two clouds, two
 * cacti, two retro computers, two bubble teas), so the prefix is what makes the
 * key unique. The key is what gets stored in `profiles.avatar`, so it must
 * never be renamed once a user has picked it.
 */

export const AVATARS: Record<string, number> = {
  '01_panda': require('../assets/avatars/01_panda.png'),
  '01_purple_cat': require('../assets/avatars/01_purple_cat.png'),
  '02_bear': require('../assets/avatars/02_bear.png'),
  '02_teddy_bear': require('../assets/avatars/02_teddy_bear.png'),
  '03_dino': require('../assets/avatars/03_dino.png'),
  '03_frog': require('../assets/avatars/03_frog.png'),
  '04_husky': require('../assets/avatars/04_husky.png'),
  '04_robot': require('../assets/avatars/04_robot.png'),
  '05_chick': require('../assets/avatars/05_chick.png'),
  '05_pink_ghost': require('../assets/avatars/05_pink_ghost.png'),
  '06_bunny': require('../assets/avatars/06_bunny.png'),
  '07_red_dragon': require('../assets/avatars/07_red_dragon.png'),
  '08_otter': require('../assets/avatars/08_otter.png'),
  '09_koala': require('../assets/avatars/09_koala.png'),
  '09_white_ghost': require('../assets/avatars/09_white_ghost.png'),
  '10_lion': require('../assets/avatars/10_lion.png'),
  '10_orange_cat': require('../assets/avatars/10_orange_cat.png'),
  '11_black_cat': require('../assets/avatars/11_black_cat.png'),
  '11_elephant': require('../assets/avatars/11_elephant.png'),
  '12_monkey': require('../assets/avatars/12_monkey.png'),
  '12_shiba': require('../assets/avatars/12_shiba.png'),
  '13_hamster': require('../assets/avatars/13_hamster.png'),
  '14_lucky_cat': require('../assets/avatars/14_lucky_cat.png'),
  '15_retro_computer': require('../assets/avatars/15_retro_computer.png'),
  '15_sloth': require('../assets/avatars/15_sloth.png'),
  '16_raccoon': require('../assets/avatars/16_raccoon.png'),
  '17_red_panda': require('../assets/avatars/17_red_panda.png'),
  '17_skull': require('../assets/avatars/17_skull.png'),
  '18_astronaut': require('../assets/avatars/18_astronaut.png'),
  '18_hedgehog': require('../assets/avatars/18_hedgehog.png'),
  '20_coffee': require('../assets/avatars/20_coffee.png'),
  '21_cloud': require('../assets/avatars/21_cloud.png'),
  '23_black_dragon': require('../assets/avatars/23_black_dragon.png'),
  '23_penguin': require('../assets/avatars/23_penguin.png'),
  '24_alpaca': require('../assets/avatars/24_alpaca.png'),
  '25_avocado': require('../assets/avatars/25_avocado.png'),
  '26_cactus': require('../assets/avatars/26_cactus.png'),
  '27_mountain': require('../assets/avatars/27_mountain.png'),
  '29_capybara': require('../assets/avatars/29_capybara.png'),
  '29_robot': require('../assets/avatars/29_robot.png'),
  '30_hooded_mask': require('../assets/avatars/30_hooded_mask.png'),
  '30_whale': require('../assets/avatars/30_whale.png'),
  '31_alien': require('../assets/avatars/31_alien.png'),
  '31_vr_gamer': require('../assets/avatars/31_vr_gamer.png'),
  '32_pixel_hero': require('../assets/avatars/32_pixel_hero.png'),
  '33_goggles_dog': require('../assets/avatars/33_goggles_dog.png'),
  '33_retro_computer': require('../assets/avatars/33_retro_computer.png'),
  '34_fox': require('../assets/avatars/34_fox.png'),
  '35_bubble_tea': require('../assets/avatars/35_bubble_tea.png'),
  '36_axolotl': require('../assets/avatars/36_axolotl.png'),
  '38_ufo': require('../assets/avatars/38_ufo.png'),
  '40_sleepy_crescent': require('../assets/avatars/40_sleepy_crescent.png'),
  '42_magic_book': require('../assets/avatars/42_magic_book.png'),
  '43_potion': require('../assets/avatars/43_potion.png'),
  '45_skull_bomb': require('../assets/avatars/45_skull_bomb.png'),
  '46_rainbow': require('../assets/avatars/46_rainbow.png'),
  '47_sun': require('../assets/avatars/47_sun.png'),
  '48_cloud': require('../assets/avatars/48_cloud.png'),
  '49_storm_cloud': require('../assets/avatars/49_storm_cloud.png'),
  '50_crescent_moon': require('../assets/avatars/50_crescent_moon.png'),
  '51_snowflake': require('../assets/avatars/51_snowflake.png'),
  '52_pink_flower': require('../assets/avatars/52_pink_flower.png'),
  '53_clover': require('../assets/avatars/53_clover.png'),
  '55_burger': require('../assets/avatars/55_burger.png'),
  '56_fries': require('../assets/avatars/56_fries.png'),
  '57_pizza': require('../assets/avatars/57_pizza.png'),
  '58_bubble_tea': require('../assets/avatars/58_bubble_tea.png'),
  '59_ice_cream': require('../assets/avatars/59_ice_cream.png'),
  '61_cake': require('../assets/avatars/61_cake.png'),
  '62_chocolate': require('../assets/avatars/62_chocolate.png'),
  '63_popcorn': require('../assets/avatars/63_popcorn.png'),
  '64_succulent': require('../assets/avatars/64_succulent.png'),
  '65_succulent_2': require('../assets/avatars/65_succulent_2.png'),
  '66_cactus': require('../assets/avatars/66_cactus.png'),
  '67_terrarium': require('../assets/avatars/67_terrarium.png'),
  '68_bonsai': require('../assets/avatars/68_bonsai.png'),
  '69_lotus': require('../assets/avatars/69_lotus.png'),
  '70_mushroom': require('../assets/avatars/70_mushroom.png'),
  '71_candle': require('../assets/avatars/71_candle.png'),
  '72_lantern': require('../assets/avatars/72_lantern.png'),
  '74_camera': require('../assets/avatars/74_camera.png'),
  '76_lightning': require('../assets/avatars/76_lightning.png'),
  '79_trophy': require('../assets/avatars/79_trophy.png'),
  '82_anime_boy': require('../assets/avatars/82_anime_boy.png'),
  '83_anime_girl': require('../assets/avatars/83_anime_girl.png'),
  '84_cool_guy': require('../assets/avatars/84_cool_guy.png'),
  '85_pink_headphones': require('../assets/avatars/85_pink_headphones.png'),
  '86_brown_hoodie': require('../assets/avatars/86_brown_hoodie.png'),
  '87_masked_character': require('../assets/avatars/87_masked_character.png'),
  '88_green_blob': require('../assets/avatars/88_green_blob.png'),
  '89_fire': require('../assets/avatars/89_fire.png'),
  '90_blue_ghost': require('../assets/avatars/90_blue_ghost.png'),
};

/** Stable render order — the numeric prefix in the filename is the intended one. */
export const AVATAR_KEYS: string[] = Object.keys(AVATARS);

/**
 * The face everyone starts with (owner, 2026-08-12) — the first one in the
 * picker, so "the default" and "the top-left cell" are the same thing and the
 * grid never disagrees with the header.
 *
 * ⚠️ THIS IS A RENDER-TIME DEFAULT, NOT A WRITE. Nothing is stored when a user
 * has not chosen: `profile.avatar` stays empty until they actually pick one.
 * That is what makes it apply to the ~27 EXISTING accounts as well as new
 * signups, with no backfill, no migration, and nothing to go half-done — the
 * same reasoning that governs the emoji-avatar migration above.
 *
 * ⚠️ Reordering AVATARS changes what every un-chosen user's face is. The keys
 * are stable because they are stored; this constant's VALUE is not, so if the
 * first entry ever changes, everyone who never picked changes with it. Pin a
 * specific key here instead if that ever matters.
 */
export const DEFAULT_AVATAR_KEY: string = AVATAR_KEYS[0];

/**
 * Resolve a stored `profile.avatar` to an image source.
 *
 * ⚠️ Returns undefined for values saved BEFORE this change, which are emoji
 * characters ('🐶', '🎧', …) and match no key. That is deliberate and is the
 * whole migration strategy: no backfill, no data rewrite. Render sites fall
 * back to drawing the stored string as text, so an existing user's face keeps
 * working untouched until they pick a new one. See `isLegacyAvatar`.
 */
export function avatarSource(value?: string | null): number | undefined {
  return value ? AVATARS[value] : undefined;
}

/**
 * True for a pre-2026-08-10 emoji avatar — something to draw as TEXT.
 *
 * ⚠️ Not simply "missing from the map". Avatar keys can be withdrawn (ten were,
 * for IP reasons), and a withdrawn key is also missing from the map — printing
 * it as text would put the literal string `22_yellow_mouse` in someone's avatar
 * frame. So the test is the value's SHAPE: anything matching the `<digits>_<name>`
 * key format is a key, present or not, and never text. Everything else is an
 * emoji from the old picker.
 */
export function isLegacyAvatar(value?: string | null): boolean {
  return !!value && !(value in AVATARS) && !/^\d+_/.test(value);
}

/** "18_astronaut" -> "Astronaut". Used for accessibility labels only. */
export function avatarLabel(key: string): string {
  return key.replace(/^\d+_/, '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
