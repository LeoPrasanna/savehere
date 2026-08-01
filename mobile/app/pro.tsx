import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Label, Body, Title, Rule, Index, GhostButton, FilledButton, TextAction, Rail } from '../components/kit';
import * as haptics from '../services/haptics';
import { pricingForDevice, savingPct, money, PRO_BENEFITS, Plan } from '../constants/pricing';
import { colors, spacing, font, tracking, typeface, themed } from '../constants/theme';

/**
 * The Pro paywall — two pages.
 *
 *   01  What you get, and what it costs.
 *   02  Payment details.
 *
 * ⚠️ PAGE 02 IS A MOCK. There is no payment provider wired up; "Pay" waits a
 * beat and reports success without charging anything or granting the tier. The
 * TEST-MODE banner is NOT decoration — a payment form that looks real and does
 * nothing is how a real person ends up typing a real card number into a dead
 * field. Do not remove the banner before real billing lands.
 *
 * Real billing = StoreKit/Play Billing (Apple takes its cut on digital goods;
 * a card form would be rejected at review anyway) via RevenueCat, whose webhook
 * writes `app_metadata.tier = "pro"` — the value `app/quota.py` already reads.
 */

const TEST_CARD = '4242 4242 4242 4242';

export default function ProScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pricing = pricingForDevice();
  const saving = savingPct(pricing);

  const [page, setPage] = useState<1 | 2>(1);
  const [planId, setPlanId] = useState<Plan['id']>('monthly');
  const [busy, setBusy] = useState(false);

  // Dummy defaults, deliberately the well-known test card so nobody mistakes
  // this for a live form.
  const [card, setCard] = useState(TEST_CARD);
  const [expiry, setExpiry] = useState('12 / 30');
  const [cvc, setCvc] = useState('123');
  const [name, setName] = useState('');

  const plan = pricing.plans.find(p => p.id === planId)!;

  const close = () => { haptics.tap(); router.back(); };

  const toPayment = () => { haptics.tap(); setPage(2); };

  const pay = async () => {
    haptics.tap();
    setBusy(true);
    // Simulated round-trip. Nothing is charged and no tier is granted.
    await new Promise(r => setTimeout(r, 900));
    setBusy(false);
    const msg = 'Test mode — no payment was taken and Pro was not activated. Real billing is not wired up yet.';
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Nothing was charged', msg);
  };

  return (
    <View style={styles.screen}>
      {/* ── Top bar: close + which page we're on ── */}
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={page === 1 ? close : () => setPage(1)} hitSlop={12} style={styles.topBtn}>
          <Icon name={page === 1 ? 'close' : 'back'} size={20} color={colors.textPrimary} />
        </Pressable>
        <Rail step={page} total={2} />
      </View>
      <Rule />

      {page === 1 ? (
        /* ── 01 · What you get ────────────────────────────────────────────── */
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
        >
          <Label wide style={styles.eyebrow}>SaveHere Pro</Label>
          <Title style={styles.hero}>Everything you save,{'\n'}actually working for you.</Title>
          <Body style={styles.lede}>
            The free tier keeps your links safe. Pro is what turns them into something you use.
          </Body>

          <View style={styles.benefits}>
            <Rule />
            {PRO_BENEFITS.map((b, i) => (
              <View key={b.title} style={styles.benefit}>
                <Index n={i + 1} style={styles.benefitIndex} />
                <View style={styles.benefitText}>
                  <Text style={styles.benefitTitle}>{b.title}</Text>
                  <Body style={styles.benefitDetail}>{b.detail}</Body>
                </View>
              </View>
            ))}
          </View>

          <Label wide style={styles.pickHead}>Choose a plan</Label>
          <View style={styles.plans}>
            {pricing.plans.map(p => {
              const on = p.id === planId;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => { haptics.tap(); setPlanId(p.id); }}
                  style={[styles.plan, on && styles.planOn]}
                  accessibilityLabel={`${p.period}, ${money(pricing, p.price)}`}
                >
                  <View style={styles.planTop}>
                    <Label tone={on ? 'ink' : 'muted'} wide>{p.period}</Label>
                    {/* Only rendered when the maths actually supports it —
                        see savingPct() in constants/pricing.ts. */}
                    {p.id === 'monthly' && saving !== null && (
                      <Label tone={on ? 'ink' : 'muted'}>{`Save ${saving}%`}</Label>
                    )}
                  </View>
                  <View style={styles.planPriceRow}>
                    <Text style={[styles.planPrice, on && styles.planPriceOn]}>
                      {money(pricing, p.price)}
                    </Text>
                    {p.wasPrice != null && (
                      <Text style={styles.planWas}>{money(pricing, p.wasPrice)}</Text>
                    )}
                  </View>
                  <Label>{p.note}</Label>
                </Pressable>
              );
            })}
          </View>

          <FilledButton label="Continue" trailing="→" onPress={toPayment} style={styles.cta} />
          <Text style={styles.terms}>
            Auto-renews {plan.cadence === 'week' ? 'weekly' : 'monthly'} until cancelled. Cancel any
            time from your account. Prices shown in {pricing.code}.
          </Text>
        </ScrollView>
      ) : (
        /* ── 02 · Payment ─────────────────────────────────────────────────── */
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Label wide style={styles.eyebrow}>Payment</Label>
          <Title style={styles.hero}>Confirm and pay</Title>

          {/* Loud on purpose. See the file header. */}
          <View style={styles.testBanner}>
            <Icon name="alert-circle" size={15} color={colors.textPrimary} />
            <Text style={styles.testText}>
              TEST MODE — this form is a mock. Nothing is charged, Pro is not activated, and no
              card details are sent anywhere. Do not enter a real card.
            </Text>
          </View>

          <Label wide style={styles.pickHead}>Order</Label>
          <Rule />
          <View style={styles.orderRow}>
            <Body tone="primary">SaveHere Pro · {plan.period}</Body>
            <Text style={styles.orderAmt}>{money(pricing, plan.price)}</Text>
          </View>
          <Rule />
          {plan.wasPrice != null && (
            <>
              <View style={styles.orderRow}>
                <Body>Launch discount</Body>
                <Text style={styles.orderAmt}>
                  −{money(pricing, plan.wasPrice - plan.price)}
                </Text>
              </View>
              <Rule />
            </>
          )}
          <View style={styles.orderRow}>
            <Label wide tone="ink">Due today</Label>
            <Text style={styles.orderTotal}>{money(pricing, plan.price)}</Text>
          </View>
          <Rule />

          <Label wide style={styles.pickHead}>Card</Label>
          <Field
            label="Card number" value={card} onChangeText={setCard}
            keyboardType="number-pad" accessibilityLabel="Card number"
          />
          <View style={styles.split}>
            <Field
              label="Expiry" value={expiry} onChangeText={setExpiry}
              style={styles.splitItem} accessibilityLabel="Expiry date"
            />
            <Field
              label="CVC" value={cvc} onChangeText={setCvc}
              keyboardType="number-pad" style={styles.splitItem} accessibilityLabel="Security code"
            />
          </View>
          <Field
            label="Name on card" value={name} onChangeText={setName}
            placeholder="As printed" autoCapitalize="words" accessibilityLabel="Name on card"
          />

          {busy ? (
            <View style={styles.busy}><ActivityIndicator color={colors.textPrimary} /></View>
          ) : (
            <FilledButton
              label={`Pay ${money(pricing, plan.price)}`}
              onPress={pay}
              style={styles.cta}
            />
          )}

          <View style={styles.footLinks}>
            <TextAction label="Restore purchases" onPress={() => haptics.tap()} />
            <TextAction label="Terms" onPress={() => haptics.tap()} />
            <TextAction label="Privacy" onPress={() => haptics.tap()} />
          </View>
          <Text style={styles.terms}>
            Auto-renews {plan.cadence === 'week' ? 'weekly' : 'monthly'} at {money(pricing, plan.price)} until
            cancelled. Cancel any time from your account.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

/** Underlined field — same grammar as the login form: a rule, not a box. */
function Field({ label, style, ...rest }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style]}>
      <Label>{label}</Label>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textTertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      <View style={[styles.fieldRule, focused && styles.fieldRuleOn]} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  topBtn: { padding: spacing.xs, marginLeft: -spacing.xs },

  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  eyebrow: { marginBottom: spacing.md },
  hero: { marginBottom: spacing.md },
  lede: { marginBottom: spacing.xl },

  benefits: { marginBottom: spacing.xl },
  benefit: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  benefitIndex: { paddingTop: 3, width: 22 },
  benefitText: { flex: 1, minWidth: 0, gap: spacing.xs },
  benefitTitle: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.lg,
    letterSpacing: tracking.heading,
  },
  benefitDetail: { fontSize: font.sm, lineHeight: 20 },

  pickHead: { marginBottom: spacing.md },
  plans: { gap: spacing.sm, marginBottom: spacing.xl },
  // Selection reads by BORDER WEIGHT, not fill or hue — the system has no
  // second colour to spend and a filled card would out-shout the CTA.
  plan: {
    borderWidth: 1,
    borderColor: colors.ghostLine,
    padding: spacing.md,
    gap: spacing.sm,
  },
  planOn: { borderColor: colors.textPrimary },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  planPrice: {
    color: colors.textSecondary,
    fontFamily: typeface.display,
    fontSize: font.xxl,
    letterSpacing: tracking.title,
  },
  planPriceOn: { color: colors.textPrimary },
  planWas: {
    color: colors.textTertiary,
    fontFamily: typeface.body,
    fontSize: font.md,
    textDecorationLine: 'line-through',
  },

  testBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  testText: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: typeface.label,
    fontSize: font.xs,
    lineHeight: 16,
    letterSpacing: tracking.label,
  },

  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  orderAmt: {
    color: colors.textSecondary,
    fontFamily: typeface.body,
    fontSize: font.md,
    fontVariant: ['tabular-nums'],
  },
  orderTotal: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.xl,
    letterSpacing: tracking.heading,
    fontVariant: ['tabular-nums'],
  },

  field: { gap: spacing.xs, marginBottom: spacing.lg },
  input: {
    color: colors.textPrimary,
    fontFamily: typeface.body,
    fontSize: font.lg,
    paddingVertical: spacing.sm,
  },
  fieldRule: { height: 1, backgroundColor: colors.ghostLine },
  fieldRuleOn: { backgroundColor: colors.textPrimary },
  split: { flexDirection: 'row', gap: spacing.lg },
  splitItem: { flex: 1 },

  busy: { marginTop: spacing.md, paddingVertical: spacing.md, alignItems: 'center' },
  cta: { marginTop: spacing.sm },
  footLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  terms: {
    color: colors.textTertiary,
    fontFamily: typeface.body,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: spacing.md,
  },
}));
