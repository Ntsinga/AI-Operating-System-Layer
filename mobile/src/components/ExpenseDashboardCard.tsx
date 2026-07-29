import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { analyzeSmsFinances, extractReceipt, getMonthlyFinances, getRecurringCharges, type MonthlyFinance, type RecurringCharge } from '../planner/expenseClient';
import { getSmsInboxModule } from '../native/SmsInbox';
import { getMediaCaptureModule } from '../native/MediaCapture';
import { getExpenseStore } from '../native/ExpenseStore';
import { connectGoogleAccountTool } from '../tools/registry';
import { BACKEND_BASE_URL } from '../config/backend';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

const SMS_LOOKBACK_HOURS = 744; // native cap (31 days); backend filters to the requested day/month
const SUBSCRIPTION_LOOKBACK_HOURS = 4320; // ~180 days - enough history to see a monthly charge repeat
type Mode = 'month' | 'day';
type Source = 'gmail' | 'sms' | 'both';
type BusySource = Source | 'receipt' | 'subscriptions' | null;
type ExpenseItem = MonthlyFinance['items'][number];

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
  const [addOpen, setAddOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualCurrency, setManualCurrency] = useState('UGX');
  const [manualCategory, setManualCategory] = useState('');
  const [manualSubject, setManualSubject] = useState('');
  const [manualType, setManualType] = useState<'expense' | 'revenue'>('expense');
  // Manually-typed and scanned entries persist on-device (ExpenseStoreModule.kt) so they survive
  // app restarts and this card unmounting - and so the add_expense_entry planner tool (voice:
  // "Hey Casper, I spent 5000 on lunch") writes to the exact same store this card reads from,
  // without needing this card to be open. Kept separate from `data` (the Gmail/SMS load result)
  // and merged at render time, since a fresh Gmail/SMS load replaces `data` wholesale but must
  // never wipe out persisted entries.
  const [persistedItems, setPersistedItems] = useState<ExpenseItem[]>([]);
  const [recurringCharges, setRecurringCharges] = useState<RecurringCharge[] | null>(null);

  const year = anchor.getFullYear();
  const month = anchor.getMonth() + 1;
  const day = mode === 'day' ? anchor.getDate() : undefined;
  const anchorLabel = mode === 'day'
    ? anchor.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  useEffect(() => { void refreshPersistedItems(); }, []);

  async function refreshPersistedItems() {
    try {
      const blob = await getExpenseStore().getExpenseEntries();
      setPersistedItems(JSON.parse(blob || '[]'));
    } catch {
      // Best-effort - a fresh install (no native module built yet) just means no persisted items.
    }
  }

  async function persistItem(item: ExpenseItem) {
    await getExpenseStore().addExpenseEntry(JSON.stringify(item));
    await refreshPersistedItems();
  }

  function isInSelectedPeriod(dateIso: string): boolean {
    const when = new Date(dateIso);
    if (Number.isNaN(when.getTime())) return true; // keep unparseable dates rather than hiding them
    if (when.getFullYear() !== year || when.getMonth() + 1 !== month) return false;
    if (day && when.getDate() !== day) return false;
    return true;
  }

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

  // Single entry point instead of separate Gmail/SMS buttons - asks which source(s) once, then
  // merges results into one breakdown. "both" tolerates one source failing (e.g. Gmail not
  // connected) and still shows whatever the other source found, rather than an all-or-nothing load.
  function promptLoadSource() {
    Alert.alert('Load expenses from...', undefined, [
      { text: 'Gmail', onPress: () => void loadExpenses('gmail') },
      { text: 'SMS', onPress: () => void loadExpenses('sms') },
      { text: 'Both', onPress: () => void loadExpenses('both') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function loadExpenses(source: Source) {
    setBusySource(source); setError(null);
    try {
      if (source === 'gmail') { await applyResult(await getMonthlyFinances(year, month, day)); return; }
      if (source === 'sms') {
        const messages = await getSmsInboxModule().getRecentSms(SMS_LOOKBACK_HOURS);
        await applyResult(await analyzeSmsFinances(year, month, messages, day));
        return;
      }
      const [gmail, sms] = await Promise.allSettled([
        getMonthlyFinances(year, month, day),
        getSmsInboxModule().getRecentSms(SMS_LOOKBACK_HOURS).then((messages) => analyzeSmsFinances(year, month, messages, day)),
      ]);
      if (gmail.status === 'rejected' && sms.status === 'rejected') throw gmail.reason;
      if (gmail.status === 'rejected') setError(gmail.reason instanceof Error ? `${gmail.reason.message} (showing SMS results only)` : 'Gmail load failed.');
      if (sms.status === 'rejected') setError(sms.reason instanceof Error ? `${sms.reason.message} (showing Gmail results only)` : 'SMS load failed.');
      const items = [
        ...(gmail.status === 'fulfilled' ? gmail.value.items : []),
        ...(sms.status === 'fulfilled' ? sms.value.items : []),
      ];
      await applyResult(withRecomputedTotals({ ...emptyFinance(year, month), items }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Finance load failed.'); }
    finally { setBusySource(null); }
  }

  // Pulls a much wider SMS window (180 days vs the normal 31) since confirming a charge repeats
  // monthly needs at least two occurrences - a single month's data can never show that. Read-only
  // detection, no OpenAI call, doesn't touch or replace whatever's currently loaded/displayed.
  async function findRecurringCharges() {
    setBusySource('subscriptions'); setError(null);
    try {
      const messages = await getSmsInboxModule().getRecentSms(SUBSCRIPTION_LOOKBACK_HOURS);
      const result = await analyzeSmsFinances(year, month, messages, undefined, true);
      setRecurringCharges(await getRecurringCharges(result.items));
    } catch (e) { setError(e instanceof Error ? e.message : 'Recurring-charge detection failed.'); }
    finally { setBusySource(null); }
  }

  // Scans a receipt and appends it as a candidate expense to whatever is already loaded, rather
  // than re-running /expenses/analyze (that costs an OpenAI call per load - not worth spending
  // again just to add one item the user hasn't even reviewed yet). The panel stays open
  // afterward so several receipts/manual entries can be added back to back.
  async function scanReceipt() {
    setBusySource('receipt'); setError(null);
    try {
      const photo = await getMediaCaptureModule().takePhoto();
      const receipt = await extractReceipt(photo.uri);
      const total = Number(receipt.total);
      if (!total || Number.isNaN(total)) throw new Error('Could not read a total from that receipt.');
      await persistItem({
        type: 'expense',
        amount: total,
        currency: String(receipt.currency ?? '').toUpperCase() || 'UGX',
        category: String(receipt.category ?? '') || 'Other',
        subject: String(receipt.merchant ?? 'Receipt'),
        date: String(receipt.date ?? new Date().toISOString()),
        sourceId: `receipt-${Date.now()}`,
        confidence: String(receipt.confidence ?? 'medium'),
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Receipt scan failed.'); }
    finally { setBusySource(null); }
  }

  async function addManualExpense() {
    const amount = Number(manualAmount);
    if (!amount || Number.isNaN(amount)) { setError('Enter a valid amount.'); return; }
    setError(null);
    await persistItem({
      type: manualType,
      amount,
      currency: manualCurrency.trim().toUpperCase() || 'UGX',
      category: manualCategory.trim() || 'Other',
      subject: manualSubject.trim() || 'Manual entry',
      date: new Date().toISOString(),
      sourceId: `manual-${Date.now()}`,
      confidence: 'high',
    });
    setManualAmount(''); setManualCategory(''); setManualSubject('');
  }

  async function connectGoogle() {
    setConnecting(true);
    try { await connectGoogleAccountTool.execute(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open Google sign-in.'); }
    finally { setConnecting(false); }
  }

  const needsGoogleConnect = /connect a google account/i.test(error ?? '');
  const busy = busySource !== null;
  const displayedItems = [...(data?.items ?? []), ...persistedItems.filter((item) => isInSelectedPeriod(item.date))];
  const categories: Record<string, number> = {};
  displayedItems.filter((item) => item.type === 'expense').forEach((item) => { categories[item.category] = (categories[item.category] ?? 0) + item.amount; });
  const max = Math.max(1, ...Object.values(categories));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Finance overview</Text>
      <Text style={styles.description}>Review expenses and revenue by day or month. Values remain candidates until you confirm them.</Text>

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
        <GradientButton label={busySource === 'gmail' || busySource === 'sms' || busySource === 'both' ? 'Loading...' : 'Load expenses'} disabled={busy} onPress={promptLoadSource} style={styles.buttonHalf} />
        <GradientButton label={addOpen ? 'Close' : 'Add expense'} onPress={() => setAddOpen((value) => !value)} style={styles.buttonHalf} />
      </View>

      {addOpen ? (
        <View style={styles.addPanel}>
          <Text style={styles.addPanelHint}>Type an expense or scan a receipt - this stays open so you can add several in a row.</Text>
          <GradientButton label={busySource === 'receipt' ? 'Scanning...' : 'Scan receipt'} disabled={busy} onPress={() => void scanReceipt()} style={styles.scanButton} />
          <View style={styles.divider} />
          <View style={styles.modeRow}>
            <Pressable style={[styles.modePill, manualType === 'expense' && styles.modePillActive]} onPress={() => setManualType('expense')}>
              <Text style={[styles.modePillText, manualType === 'expense' && styles.modePillTextActive]}>Expense</Text>
            </Pressable>
            <Pressable style={[styles.modePill, manualType === 'revenue' && styles.modePillActive]} onPress={() => setManualType('revenue')}>
              <Text style={[styles.modePillText, manualType === 'revenue' && styles.modePillTextActive]}>Revenue</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.buttonHalf]} value={manualAmount} onChangeText={setManualAmount} placeholder="Amount" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
            <TextInput style={[styles.input, styles.buttonHalf]} value={manualCurrency} onChangeText={setManualCurrency} placeholder="Currency" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          </View>
          <TextInput style={styles.input} value={manualCategory} onChangeText={setManualCategory} placeholder="Category (e.g. Food)" placeholderTextColor={colors.textMuted} />
          <TextInput style={styles.input} value={manualSubject} onChangeText={setManualSubject} placeholder="Merchant / description" placeholderTextColor={colors.textMuted} />
          <GradientButton label="Add" disabled={!manualAmount.trim()} onPress={() => void addManualExpense()} />
        </View>
      ) : null}

      <GradientButton label={busySource === 'subscriptions' ? 'Scanning 180 days of SMS...' : 'Find recurring charges'} disabled={busy} onPress={() => void findRecurringCharges()} style={styles.connectButton} />
      {recurringCharges ? (
        recurringCharges.length === 0 ? (
          <Text style={styles.summary}>No recurring charges found in the last 180 days.</Text>
        ) : (
          <View style={styles.addPanel}>
            <Text style={styles.addPanelHint}>Charges that repeat roughly monthly:</Text>
            {recurringCharges.map((charge) => (
              <View key={`${charge.subject}-${charge.amount}-${charge.currency}`} style={styles.barRow}>
                <Text style={styles.category} numberOfLines={1}>{charge.subject}</Text>
                <Text style={styles.summary}>{charge.occurrences}x</Text>
                <Text style={styles.amount}>{charge.currency} {charge.amount.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        )
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {needsGoogleConnect ? <GradientButton label={connecting ? 'Opening Google sign-in...' : 'Connect Google Account'} disabled={connecting} onPress={() => void connectGoogle()} style={styles.connectButton} /> : null}

      {displayedItems.length > 0 ? (
        <>
          <Text style={styles.summary}>Expenses and revenue are grouped by currency. {displayedItems.length} candidate item(s).</Text>
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
  modePill: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, paddingHorizontal: 14, paddingVertical: 8 },
  modePillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modePillText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  modePillTextActive: { color: colors.onAccent },
  stepperRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginBottom: 10 },
  stepperButton: { alignItems: 'center', backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  stepperArrow: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  stepperLabel: { color: colors.textPrimary, flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  buttonHalf: { flex: 1 },
  connectButton: { marginTop: 10 },
  addPanel: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 10, borderWidth: 1, marginBottom: 10, padding: 12 },
  addPanelHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  scanButton: { marginBottom: 4 },
  divider: { borderColor: colors.border, borderTopWidth: 1, marginBottom: 10, marginTop: 12 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.textPrimary, marginBottom: 8, minHeight: 44, paddingHorizontal: 10 },
  summary: { color: colors.textSecondary, fontSize: 12, marginTop: 12 },
  barRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 10 },
  category: { color: colors.textSecondary, width: 90 },
  track: { backgroundColor: colors.surfaceAlt, borderRadius: 5, flex: 1, height: 10, overflow: 'hidden' },
  bar: { backgroundColor: colors.accent, height: 10 },
  amount: { color: colors.textPrimary, fontSize: 12, width: 74 },
  analysis: { backgroundColor: colors.infoBg, borderColor: colors.infoBorder, borderRadius: 8, borderWidth: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 14, padding: 10 },
  error: { color: colors.dangerText, marginTop: 10 },
});
