import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { toISODate, parseLocal, todayISO } from '../services/todoDates';
import { colors, spacing, font, radius, themed } from '../constants/theme';

/**
 * A month-grid date picker built from plain Views.
 *
 * Deliberately NOT `@react-native-community/datetimepicker`: that's another
 * native dependency, it can't render in the web dev loop this project actually
 * develops in, and it looks different on every platform. ~100 lines of grid is
 * smaller than the integration cost and behaves identically everywhere.
 *
 * Past days are disabled here — this is the real enforcement of "no back-dated
 * to-dos". The server's check is a backstop against hand-crafted requests, and
 * it deliberately allows one day of slack for timezones, so the precise rule
 * has to live on the device where the user's actual calendar day is known.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface Props {
  /** "YYYY-MM-DD", or null for no date ("Someday"). */
  value: string | null;
  onChange: (iso: string | null) => void;
}

export function DatePicker({ value, onChange }: Props) {
  const today = todayISO();
  const selected = value ? parseLocal(value) : null;

  // Which month the grid is showing. Follows the selection when it changes
  // from outside (e.g. a "Next week" chip jumping into a later month).
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(selected ?? new Date()));
  useEffect(() => {
    if (selected) setCursor(startOfMonth(selected));
  }, [value]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();

  // Leading blanks so the 1st lands under its real weekday.
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ];

  // Nothing before the current month is selectable, so don't let the user walk
  // back into a wall of disabled days.
  const atCurrentMonth = startOfMonth(new Date()).getTime() >= cursor.getTime();

  const shiftMonth = (delta: number) => {
    if (delta < 0 && atCurrentMonth) return;
    setCursor(new Date(year, month + delta, 1));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          onPress={() => shiftMonth(-1)}
          scaleTo={0.9}
          hitSlop={8}
          disabled={atCurrentMonth}
          style={[styles.navBtn, atCurrentMonth && styles.navBtnOff]}
        >
          <Icon name="back" size={15} color={atCurrentMonth ? colors.textTertiary : colors.textPrimary} />
        </Pressable>

        <Text style={styles.monthLabel}>
          {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>

        <Pressable onPress={() => shiftMonth(1)} scaleTo={0.9} hitSlop={8} style={styles.navBtn}>
          <Icon name="chevron-right" size={15} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cell} />;

          const iso = toISODate(new Date(year, month, day));
          const isPast = iso < today;          // ISO dates compare correctly as strings
          const isToday = iso === today;
          const isSelected = value === iso;

          return (
            <Pressable
              key={iso}
              style={styles.cell}
              scaleTo={isPast ? 1 : 0.86}
              disabled={isPast}
              onPress={() => onChange(iso)}
            >
              <View style={[
                styles.day,
                isToday && !isSelected && styles.dayToday,
                isSelected && styles.daySelected,
              ]}>
                <Text style={[
                  styles.dayText,
                  isPast && styles.dayTextPast,
                  isSelected && styles.dayTextSelected,
                ]}>
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.footBtn, !value && styles.footBtnOn]}
          onPress={() => onChange(null)}
          scaleTo={0.96}
        >
          <Text style={[styles.footText, !value && styles.footTextOn]}>Someday (no date)</Text>
        </Pressable>
      </View>
    </View>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const styles = themed(() => StyleSheet.create({
  wrap: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderLight, padding: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 30, height: 30, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardElevated,
  },
  navBtnOff: { opacity: 0.4 },
  monthLabel: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '800' },

  weekRow: { flexDirection: 'row', marginTop: spacing.sm },
  weekday: {
    width: `${100 / 7}%`, textAlign: 'center',
    color: colors.textTertiary, fontSize: 10, fontWeight: '800',
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: {
    width: 32, height: 32, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  daySelected: { backgroundColor: colors.accent },
  dayText: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '600' },
  dayTextPast: { color: colors.textTertiary, opacity: 0.45 },
  dayTextSelected: { color: colors.onAction },

  footer: { marginTop: spacing.xs },
  footBtn: {
    borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardElevated,
  },
  footBtnOn: { borderColor: colors.accent, backgroundColor: colors.accent + '1A' },
  footText: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '700' },
  footTextOn: { color: colors.accentLight },
}));
