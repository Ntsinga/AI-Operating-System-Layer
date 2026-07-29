import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { analyzeSmsFinances, extractReceipt, getMonthlyFinances, type MonthlyFinance } from '../planner/expenseClient';
import { getSmsInboxModule } from '../native/SmsInbox';
import { getMediaCaptureModule } from '../native/MediaCapture';
import { connectGoogleAccountTool } from '../tools/registry';
import { BACKEND_BASE_URL } from '../config/backend';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

const SMS_LOOKBACK_HOURS = 744; // native cap (31 days); backend filters to the requested day/month
type Mode = 'month' | 'day';
type BusySource = 'gmail' | 'sms' | 'receipt' | null;

function emptyFinance(year: number, month: number): MonthlyFinance {
  return { year, month, items: [], totals: { expense: {}, revenue: {} }, note: '' };
}

function withRecomputedTotals(finance: MonthlyFinance): MonthlyFinance {
  const totals: Record<string, Record<string, number>> = { expense: {}, revenue: {} };
  for (const item of finance.items) totals[item.type][item.currency] = (totals[item.type][item.currency] ?? 0) + item.amount;
  return { ...finance, totals };
}

export function ExpenseDashboardCard() {
  const [anchor, setAnchor] = useState(new Date());
  const [mode, setMode] = useState<Mode>('month');
  const [data, setData] = useState<MonthlyFinance | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [busySource, setBusySource] = useState<BusySource>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const year = anchor.getFullYear();
  const month = anchor.getMonth() + 1;
  const day = mode === 'day' ? anchor.getDate() : undefined;
  const anchorLabel = mode === 'day'
    ? anchor.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function stepAnchor(delta: number) {
    const next = new Date(anchor);
    if (mode === 'day') next.setDate(next.getDate() + delta);
    else next.setMonth(next.getMonth() + delta);
    setAnchor(next);
  }

  async function applyResult(result: MonthlyFinance) {
    setData(result);
    const response = await fetch(`${BACKEND_BASE_URL}/expenses/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finances: result }) });
    const json = await response.json();
    if (response.ok) setAnalysis(json.analysis ?? '');
  }

  async function loadFromGmail() {
    setBusySource('gmail'); setError(null);
    try { await applyResult(await getMonthlyFinances(year, month, day)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Finance load failed.'); }
    finally { setBusySource(null); }
  }

  async function loadFromSms() {
    setBusySource('sms'); setError(null);
    try {
      const messages = await getSmsInboxModule().getRecentSms(SMS_LOOKBACK_HOURS);
      await applyResult(await analyzeSmsFinances(year, month, messages, day));
    } catch (e) { setError(e instanceof Error ? e.message : 'SMS finance load failed.'); }
    finally { setBusySource(null); }
  }

  // Scans a receipt and appends it as a candidate expense to whatever is already loaded, rather
  // than re-running /expenses/analyze (that costs an OpenAI call per load - not worth spending
  // again just to add one item the user hasn't even reviewed yet).
  async function scanReceipt() {
    setBusySource('receipt'); setError(null);
    try {
      const photo = await getMediaCaptureModule().takePhoto();
      const receipt = await extractReceipt(photo.uri);
      const total = Number(receipt.total);
      if (!total || Number.isNaN(total)) throw new Error('Could not read a total from that receipt.');
      const item = {
        type: 'expense' as const,
        amount: total,
        currency: String(receipt.currency ?? '').toUpperCase() || 'UGX',
        category: String(receipt.category ?? '') || 'Other',
        subject: String(receipt.merchant ?? 'Receipt'),
        date: String(receipt.date ?? new Date().toISOString()),
        sourceId: `receipt-${Date.now()}`,
        confidence: String(receipt.confidence ?? 'medium'),
      };
      const base = data ?? emptyFinance(year, month);
      setData(withRecomputedTotals({ ...base, items: [...base.items, item] }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Receipt scan failed.'); }
    finally { setBusySource(null); }
  }

  async function connectGoogle() {
    setConnecting(true);
    try { await connectGoogleAccountTool.execute(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open Google sign-in.'); }
    finally { setConnecting(false); }
  }

  const needsGoogleConnect = /connect a google account/i.test(error ?? '');
  const busy = busySource !== null;
  const categories: Record<string, number> = {};
  data?.items.filter((item) => item.type === 'expense').forEach((item) => { categories[item.category] = (categories[item.category] ?? 0) + item.amount; });
  const max = Math.max(1, ...Object.values(categories));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Finance overview</Text>
      <Text style={styles.description}>Review expenses and revenue by day or month, derived from your connected Gmail, on-device SMS, or scanned receipts. Values remain candidates until you confirm them.</Text>

      <View style={styles.modeRow}>
        <Pressable style={[styles.modePill, mode === 'month' && styles.modePillActive]} onPress={() => setMode('month')}>
          <Text style={[styles.modePillText, mode === 'month' && styles.modePillTextActive]}>Month</Text>
        </Pressable>
        <Pressable style={[styles.modePill, mode === 'day' && styles.modePillActive]} onPress={() => setMode('day')}>
          <Text style={[styles.modePillText, mode === 'day' && styles.modePillTextActive]}>Day</Text>
        </Pressable>
      </View>

      <View style={styles.stepperRow}>
        <Pressable style={styles.stepperButton} onPress={() => stepAnchor(-1)}><Text style={styles.stepperArrow}>‹</Text></Pressable>
        <Text style={styles.stepperLabel}>{anchorLabel}</Text>
        <Pressable style={styles.stepperButton} onPress={() => stepAnchor(1)}><Text style={styles.stepperArrow}>›</Text></Pressable>
      </View>

      <View style={styles.row}>
        <GradientButton label={busySource === 'gmail' ? 'Analyzing...' : 'Load from Gmail'} disabled={busy} onPress={() => void loadFromGmail()} style={styles.buttonThird} />
        <GradientButton label={busySource === 'sms' ? 'Analyzing...' : 'Load from SMS'} disabled={busy} onPress={() => void loadFromSms()} style={styles.buttonThird} />
        <GradientButton label={busySource === 'receipt' ? 'Scanning...' : 'Scan Receipt'} disabled={busy} onPress={() => void scanReceipt()} style={styles.buttonThird} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {needsGoogleConnect ? <GradientButton label={connecting ? 'Opening Google sign-in...' : 'Connect Google Account'} disabled={connecting} onPress={() => void connectGoogle()} style={styles.connectButton} /> : null}

      {data ? (
        <>
          <Text style={styles.summary}>Expenses and revenue are grouped by currency. {data.items.length} candidate item(s).</Text>
          {Object.entries(categories).map(([category, value]) => (
            <View key={category} style={styles.barRow}>
              <Text style={styles.category}>{category}</Text>
              <View style={styles.track}><View style={[styles.bar, { width: `${(value / max) * 100}%` }]} /></View>
              <Text style={styles.amount}>{value.toLocaleString()}</Text>
            </View>
          ))}
          {analysis ? <Text style={styles.analysis}>{analysis}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 16 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12, marginTop: 6 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modePill: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  modePillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modePillText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  modePillTextActive: { color: colors.onAccent },
  stepperRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginBottom: 10 },
  stepperButton: { alignItems: 'center', backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  stepperArrow: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  stepperLabel: { color: colors.textPrimary, flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  buttonThird: { flex: 1 },
  connectButton: { marginTop: 10 },
  summary: { color: colors.textSecondary, fontSize: 12, marginTop: 12 },
  barRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 10 },
  category: { color: colors.textSecondary, width: 90 },
  track: { backgroundColor: colors.surfaceAlt, borderRadius: 5, flex: 1, height: 10, overflow: 'hidden' },
  bar: { backgroundColor: colors.accent, height: 10 },
  amount: { color: colors.textPrimary, fontSize: 12, width: 74 },
  analysis: { backgroundColor: colors.infoBg, borderColor: colors.infoBorder, borderRadius: 8, borderWidth: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 14, padding: 10 },
  error: { color: colors.dangerText, marginTop: 10 },
});
