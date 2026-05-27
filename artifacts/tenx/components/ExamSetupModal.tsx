import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { useExamMode } from "@/contexts/ExamModeContext";
import { useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ExamSetupModal({ visible, onClose }: Props) {
  const colors = useColors();
  const { topics, reconfigureExamSubjects } = useTopics();
  const { activateExamMode, examDate: existingDate, examSubjects: existingSubjects } = useExamMode();

  const defaultDate = useMemo(() => {
    if (existingDate) return new Date(existingDate);
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  }, [existingDate]);

  const [step, setStep] = useState<1 | 2>(1);
  const [year, setYear] = useState(defaultDate.getFullYear());
  const [month, setMonth] = useState(defaultDate.getMonth());
  const [day, setDay] = useState(defaultDate.getDate());
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(existingSubjects);
  const [saving, setSaving] = useState(false);

  // Sync initial values when modal opens
  useEffect(() => {
    if (visible) {
      const d = existingDate ? new Date(existingDate) : defaultDate;
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setDay(d.getDate());
      setSelectedSubjects(existingSubjects.length > 0 ? existingSubjects : []);
      setStep(1);
      setSaving(false);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSubjects = useMemo(() => {
    const s = new Set(topics.map((t) => t.subject));
    return Array.from(s).sort();
  }, [topics]);

  const toggleSubject = useCallback((subject: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject],
    );
  }, []);

  const examDateTs = useMemo(
    () => new Date(year, month, day, 23, 59, 59, 999).getTime(),
    [year, month, day],
  );

  const daysLeft = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exam = new Date(year, month, day);
    exam.setHours(0, 0, 0, 0);
    return Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  }, [year, month, day]);

  const handleActivate = useCallback(async () => {
    if (selectedSubjects.length === 0 || saving) return;
    setSaving(true);
    const nonExamSubjects = allSubjects.filter((s) => !selectedSubjects.includes(s));
    // Atomic: restore previously suspended + suspend new non-exam subjects in one persist
    await reconfigureExamSubjects(nonExamSubjects, examDateTs);
    await activateExamMode(selectedSubjects, examDateTs);
    setSaving(false);
    onClose();
  }, [selectedSubjects, allSubjects, examDateTs, activateExamMode, reconfigureExamSubjects, saving, onClose]);

  const isDateValid = daysLeft > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              {/* Header */}
              <View style={styles.handle} />
              <View style={styles.headerRow}>
                <View style={styles.stepIndicator}>
                  <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
                  <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
                  <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
                </View>
                <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <Feather name="x" size={20} color="#64748b" />
                </Pressable>
              </View>

              {/* Step 1: Date */}
              {step === 1 ? (
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>When is your exam?</Text>
                  <Text style={styles.stepSub}>
                    We'll build a priority revision plan around this date.
                  </Text>

                  <View style={styles.datePickerRow}>
                    <View style={styles.dateUnit}>
                      <Pressable onPress={() => setDay((d) => clamp(d + 1, 1, daysInMonth(year, month)))} hitSlop={10} style={styles.arrowBtn}>
                        <Feather name="chevron-up" size={22} color="#22d3ee" />
                      </Pressable>
                      <Text style={styles.dateValue}>{String(day).padStart(2, "0")}</Text>
                      <Pressable onPress={() => setDay((d) => clamp(d - 1, 1, daysInMonth(year, month)))} hitSlop={10} style={styles.arrowBtn}>
                        <Feather name="chevron-down" size={22} color="#22d3ee" />
                      </Pressable>
                      <Text style={styles.dateLabel}>Day</Text>
                    </View>
                    <Text style={styles.dateSep}>/</Text>
                    <View style={styles.dateUnit}>
                      <Pressable onPress={() => setMonth((m) => (m + 1) % 12)} hitSlop={10} style={styles.arrowBtn}>
                        <Feather name="chevron-up" size={22} color="#22d3ee" />
                      </Pressable>
                      <Text style={styles.dateValue}>{MONTHS[month]}</Text>
                      <Pressable onPress={() => setMonth((m) => (m + 11) % 12)} hitSlop={10} style={styles.arrowBtn}>
                        <Feather name="chevron-down" size={22} color="#22d3ee" />
                      </Pressable>
                      <Text style={styles.dateLabel}>Month</Text>
                    </View>
                    <Text style={styles.dateSep}>/</Text>
                    <View style={styles.dateUnit}>
                      <Pressable onPress={() => setYear((y) => y + 1)} hitSlop={10} style={styles.arrowBtn}>
                        <Feather name="chevron-up" size={22} color="#22d3ee" />
                      </Pressable>
                      <Text style={styles.dateValue}>{year}</Text>
                      <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={10} style={styles.arrowBtn}>
                        <Feather name="chevron-down" size={22} color="#22d3ee" />
                      </Pressable>
                      <Text style={styles.dateLabel}>Year</Text>
                    </View>
                  </View>

                  {isDateValid ? (
                    <View style={styles.daysLeftBadge}>
                      <Feather name="clock" size={13} color="#22d3ee" />
                      <Text style={styles.daysLeftText}>{daysLeft} days until exam</Text>
                    </View>
                  ) : (
                    <View style={[styles.daysLeftBadge, styles.daysLeftError]}>
                      <Feather name="alert-circle" size={13} color="#ef4444" />
                      <Text style={[styles.daysLeftText, { color: "#ef4444" }]}>Please pick a future date</Text>
                    </View>
                  )}

                  <Pressable
                    onPress={() => isDateValid && setStep(2)}
                    style={({ pressed }) => [styles.primaryBtn, { opacity: !isDateValid ? 0.4 : pressed ? 0.85 : 1 }]}
                  >
                    <Text style={styles.primaryBtnText}>Next — Select Subjects</Text>
                    <Feather name="arrow-right" size={16} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>Which subjects are in scope?</Text>
                  <Text style={styles.stepSub}>
                    Only these subjects will appear in your revision queue. Others are paused until after the exam.
                  </Text>

                  {allSubjects.length === 0 ? (
                    <View style={styles.emptySubjects}>
                      <Feather name="book-open" size={28} color="#475569" />
                      <Text style={styles.emptySubjectsText}>No subjects yet — add topics first.</Text>
                    </View>
                  ) : (
                    <ScrollView style={styles.chipScroll} contentContainerStyle={styles.chipWrap} showsVerticalScrollIndicator={false}>
                      {allSubjects.map((subject) => {
                        const active = selectedSubjects.includes(subject);
                        return (
                          <Pressable
                            key={subject}
                            onPress={() => toggleSubject(subject)}
                            style={({ pressed }) => [
                              styles.chip,
                              active && styles.chipActive,
                              { opacity: pressed ? 0.8 : 1 },
                            ]}
                          >
                            {active ? <Feather name="zap" size={13} color="#7c3aed" /> : null}
                            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                              {subject}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}

                  {selectedSubjects.length > 0 && (
                    <View style={styles.selectionInfo}>
                      <Feather name="check-circle" size={13} color="#22d3ee" />
                      <Text style={styles.selectionInfoText}>
                        {selectedSubjects.length} of {allSubjects.length} subjects selected
                      </Text>
                    </View>
                  )}

                  <View style={styles.btnRow}>
                    <Pressable
                      onPress={() => setStep(1)}
                      style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={styles.secondaryBtnText}>Back</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleActivate}
                      disabled={selectedSubjects.length === 0 || saving}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { flex: 1, opacity: selectedSubjects.length === 0 ? 0.4 : pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Feather name="zap" size={15} color="#fff" />
                      <Text style={styles.primaryBtnText}>
                        {saving ? "Activating…" : "Activate Exam Mode"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.75)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0f1628",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.12)",
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#334155",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#334155",
  },
  stepDotActive: {
    backgroundColor: "#7c3aed",
  },
  stepLine: {
    width: 28,
    height: 2,
    backgroundColor: "#334155",
    borderRadius: 1,
  },
  stepLineActive: {
    backgroundColor: "#7c3aed",
  },
  stepBody: {
    paddingHorizontal: 22,
    gap: 16,
    paddingTop: 6,
  },
  stepTitle: {
    color: "#f8fafc",
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    letterSpacing: -0.5,
  },
  stepSub: {
    color: "#94a3b8",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    marginTop: -6,
  },

  // Date picker
  datePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
  },
  dateUnit: { alignItems: "center", gap: 8 },
  arrowBtn: { padding: 4 },
  dateValue: {
    color: "#f8fafc",
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    minWidth: 54,
    textAlign: "center",
  },
  dateLabel: {
    color: "#64748b",
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dateSep: {
    color: "#334155",
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    marginTop: -18,
  },
  daysLeftBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(34,211,238,0.08)",
    borderColor: "rgba(34,211,238,0.25)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  daysLeftError: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderColor: "rgba(239,68,68,0.25)",
  },
  daysLeftText: {
    color: "#22d3ee",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },

  // Subject chips
  chipScroll: {
    maxHeight: 200,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1e293b",
  },
  chipActive: {
    borderColor: "#7c3aed",
    backgroundColor: "rgba(124,58,237,0.15)",
  },
  chipText: {
    color: "#94a3b8",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    maxWidth: 180,
  },
  chipTextActive: {
    color: "#c4b5fd",
  },
  selectionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -4,
  },
  selectionInfoText: {
    color: "#22d3ee",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  emptySubjects: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 30,
  },
  emptySubjectsText: {
    color: "#475569",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textAlign: "center",
  },

  // Buttons
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#7c3aed",
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  primaryBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  secondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  secondaryBtnText: {
    color: "#94a3b8",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
