import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ExamSetupModal } from "@/components/ExamSetupModal";
import { useExamMode } from "@/contexts/ExamModeContext";
import { Topic, useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/lib/revenuecat";

interface SubjectGroup {
  subject: string;
  topics: Topic[];
}

const AVATAR_COLORS = [
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0284c7",
  "#16a34a",
];

function getAvatarColor(name: string, idx: number): string {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length]!;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtTime(totalMin: number): string {
  if (totalMin <= 0) return "0m";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtExamDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { topics, isLoading, renameSubject, renameTopic, deleteSubject, deleteTopic, restoreSuspendedSubjects } = useTopics();
  const { isPro } = useSubscription();
  const {
    examModeActive,
    examDate,
    examSubjects,
    deactivateExamMode,
  } = useExamMode();

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const [searchQuery, setSearchQuery] = useState("");
  const [examSetupVisible, setExamSetupVisible] = useState(false);

  // ── Subjects view state ──
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [subjectSelectMode, setSubjectSelectMode] = useState(false);
  const [selectedSubjectNames, setSelectedSubjectNames] = useState<Set<string>>(new Set());
  const [showSubjectDeleteConfirm, setShowSubjectDeleteConfirm] = useState(false);
  const [editSubjectModal, setEditSubjectModal] = useState(false);
  const [editSubjectName, setEditSubjectName] = useState("");

  // ── Topics view state ──
  const [topicSelectMode, setTopicSelectMode] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [showTopicDeleteConfirm, setShowTopicDeleteConfirm] = useState(false);
  const [editTopicModal, setEditTopicModal] = useState(false);
  const [editTopicName, setEditTopicName] = useState("");

  const groups = useMemo<SubjectGroup[]>(() => {
    const map = new Map<string, SubjectGroup>();
    for (const t of topics) {
      const subject = (t.subject || "Untitled").trim();
      const current = map.get(subject);
      if (current) current.topics.push(t);
      else map.set(subject, { subject, topics: [t] });
    }
    return Array.from(map.values()).sort(
      (a, b) => {
        const bTime = b.topics.reduce((s, t) => s + (t.totalMinutesStudied || 0), 0);
        const aTime = a.topics.reduce((s, t) => s + (t.totalMinutesStudied || 0), 0);
        return bTime - aTime;
      }
    );
  }, [topics]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.subject === selectedSubject) ?? null,
    [groups, selectedSubject],
  );

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter((g) => g.subject.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  const filteredTopics = useMemo(() => {
    if (!selectedGroup) return [];
    if (!searchQuery.trim()) return selectedGroup.topics;
    const q = searchQuery.toLowerCase();
    return selectedGroup.topics.filter((t) => t.topicName.toLowerCase().includes(q));
  }, [selectedGroup, searchQuery]);

  const examPassed = examDate !== null && examDate < Date.now();

  // ── Subject long-press handlers ──
  const handleSubjectLongPress = (subject: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubjectSelectMode(true);
    setSelectedSubjectNames(new Set([subject]));
  };

  const handleSubjectTap = (subject: string) => {
    if (subjectSelectMode) {
      setSelectedSubjectNames((prev) => {
        const next = new Set(prev);
        if (next.has(subject)) next.delete(subject);
        else next.add(subject);
        return next;
      });
    } else {
      setSearchQuery("");
      setSelectedSubject(subject);
    }
  };

  const handleCancelSubjectSelect = () => {
    setSubjectSelectMode(false);
    setSelectedSubjectNames(new Set());
  };

  const handleDeleteSelectedSubjects = async () => {
    for (const subject of selectedSubjectNames) {
      await deleteSubject(subject);
    }
    setSubjectSelectMode(false);
    setSelectedSubjectNames(new Set());
    setShowSubjectDeleteConfirm(false);
  };

  // ── Topic long-press handlers ──
  const handleTopicLongPress = (topicId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTopicSelectMode(true);
    setSelectedTopicIds(new Set([topicId]));
  };

  const handleTopicTap = (topic: Topic) => {
    if (topicSelectMode) {
      setSelectedTopicIds((prev) => {
        const next = new Set(prev);
        if (next.has(topic.id)) next.delete(topic.id);
        else next.add(topic.id);
        return next;
      });
    } else {
      router.push({ pathname: "/topic/[id]", params: { id: topic.id } });
    }
  };

  const handleCancelTopicSelect = () => {
    setTopicSelectMode(false);
    setSelectedTopicIds(new Set());
  };

  const handleDeleteSelectedTopics = async () => {
    for (const id of selectedTopicIds) {
      await deleteTopic(id);
    }
    setTopicSelectMode(false);
    setSelectedTopicIds(new Set());
    setShowTopicDeleteConfirm(false);
  };

  const handleBackFromTopics = () => {
    setSelectedSubject(null);
    setTopicSelectMode(false);
    setSelectedTopicIds(new Set());
    setSearchQuery("");
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color="#22d3ee" />
      </View>
    );
  }

  // ── Subjects view ──
  if (!selectedGroup) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: topInset + 6, borderBottomColor: colors.border }]}>
          {subjectSelectMode ? (
            <View style={styles.selectHeader}>
              <Pressable onPress={handleCancelSubjectSelect} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.selectCount, { color: colors.foreground }]}>
                {selectedSubjectNames.size} selected
              </Text>
              <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
                {selectedSubjectNames.size === 1 && (
                  <Pressable
                    onPress={() => {
                      const name = Array.from(selectedSubjectNames)[0]!;
                      setEditSubjectName(name);
                      setEditSubjectModal(true);
                    }}
                    hitSlop={10}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <Feather name="edit-2" size={22} color="#22d3ee" />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => selectedSubjectNames.size > 0 && setShowSubjectDeleteConfirm(true)}
                  hitSlop={10}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Feather name="trash-2" size={22} color={selectedSubjectNames.size > 0 ? "#ef4444" : colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.titleRow}>
              <Text style={[styles.screenTitle, { color: colors.foreground }]}>Subjects</Text>
              <View style={styles.examToggle}>
                <View style={[styles.modePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Pressable
                    onPress={async () => {
                      if (examModeActive) {
                        await restoreSuspendedSubjects();
                        await deactivateExamMode();
                      }
                    }}
                    style={[styles.modeOption, !examModeActive && { backgroundColor: "#22d3ee" }]}
                  >
                    <Text style={[styles.modeOptionText, { color: !examModeActive ? "#0b1020" : colors.mutedForeground }]}>
                      Prep
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!examModeActive) {
                        if (!isPro) { router.push("/paywall"); return; }
                        setExamSetupVisible(true);
                      }
                    }}
                    style={[styles.modeOption, examModeActive && { backgroundColor: "#7c3aed" }]}
                  >
                    <Feather name="zap" size={11} color={examModeActive ? "#fff" : colors.mutedForeground} style={{ marginRight: 3 }} />
                    <Text style={[styles.modeOptionText, { color: examModeActive ? "#fff" : colors.mutedForeground }]}>
                      Exam
                    </Text>
                  </Pressable>
                </View>
                {examModeActive ? (
                  <Pressable
                    onPress={() => setExamSetupVisible(true)}
                    style={[styles.examDateChip, { borderColor: examPassed ? "#ef4444" : "#7c3aed" }]}
                  >
                    <Feather name="settings" size={11} color={examPassed ? "#ef4444" : "#7c3aed"} />
                    <Text style={[styles.examDateChipText, { color: examPassed ? "#ef4444" : "#7c3aed" }]}>
                      {examDate ? fmtExamDate(examDate) : "Configure"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}

          {/* Exam subjects summary */}
          {examModeActive && !subjectSelectMode ? (
            <View style={styles.examSubjectSection}>
              <Text style={[styles.examSubjectLabel, { color: colors.mutedForeground }]}>
                Exam subjects ({examSubjects.length})
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {examSubjects.map((s) => (
                  <View key={s} style={[styles.examChip, { backgroundColor: "#7c3aed22", borderColor: "#7c3aed" }]}>
                    <Feather name="zap" size={11} color="#7c3aed" />
                    <Text style={[styles.examChipText, { color: "#c4b5fd" }]} numberOfLines={1}>{s}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Search bar */}
          {!subjectSelectMode ? (
            <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search subjects…"
                placeholderTextColor={colors.mutedForeground}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.subject}
          contentContainerStyle={{ paddingBottom: bottomInset + 32 }}
          ListEmptyComponent={
            <View style={[styles.emptyWrap, { paddingTop: 60 }]}>
              <Feather name="book-open" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {searchQuery ? "No subjects match your search." : "No subjects yet."}
              </Text>
              {!searchQuery ? (
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  Add a topic from Home — its subject lands here.
                </Text>
              ) : null}
            </View>
          }
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
          renderItem={({ item, index }) => {
            const totalMin = item.topics.reduce((s, t) => s + (t.totalMinutesStudied || 0), 0);
            const revCount = item.topics.reduce((s, t) => s + (t.sessions?.length || 0), 0);
            const initials = getInitials(item.subject);
            const avatarBg = getAvatarColor(item.subject, index);
            const isSelected = selectedSubjectNames.has(item.subject);

            return (
              <Pressable
                onPress={() => handleSubjectTap(item.subject)}
                onLongPress={() => handleSubjectLongPress(item.subject)}
                delayLongPress={350}
                style={({ pressed }) => [
                  styles.listRow,
                  { backgroundColor: isSelected ? (colors.card) : "transparent" },
                  pressed && { backgroundColor: colors.card },
                ]}
              >
                {/* Avatar / checkbox */}
                <View style={styles.avatarCol}>
                  {subjectSelectMode ? (
                    <View style={[
                      styles.checkbox,
                      {
                        borderColor: isSelected ? "#22d3ee" : colors.border,
                        backgroundColor: isSelected ? "#22d3ee" : "transparent",
                      }
                    ]}>
                      {isSelected ? <Feather name="check" size={14} color="#0b1020" /> : null}
                    </View>
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                  )}
                </View>

                {/* Content */}
                <View style={styles.listContent}>
                  <View style={styles.listTop}>
                    <Text style={[styles.listTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {item.subject}
                    </Text>
                  </View>
                  <View style={styles.listBottom}>
                    <Text style={[styles.listSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.topics.length} {item.topics.length === 1 ? "topic" : "topics"}
                      {examModeActive && examSubjects.includes(item.subject) ? " · ⚡ exam" : ""}
              {examModeActive && !examSubjects.includes(item.subject) && item.topics.some(t => t.suspendedUntil && t.suspendedUntil > Date.now()) ? " · ⏸ paused" : ""}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />

        <ExamSetupModal visible={examSetupVisible} onClose={() => setExamSetupVisible(false)} />

        <DeleteConfirmModal
          visible={showSubjectDeleteConfirm}
          count={selectedSubjectNames.size}
          kind="subject"
          onCancel={() => setShowSubjectDeleteConfirm(false)}
          onConfirm={handleDeleteSelectedSubjects}
        />

        <EditNameModal
          visible={editSubjectModal}
          title="Rename Subject"
          value={editSubjectName}
          onChange={setEditSubjectName}
          onCancel={() => { setEditSubjectModal(false); setEditSubjectName(""); }}
          onConfirm={async () => {
            const oldName = Array.from(selectedSubjectNames)[0];
            if (oldName && editSubjectName.trim()) {
              await renameSubject(oldName, editSubjectName.trim());
              setSelectedSubjectNames(new Set([editSubjectName.trim()]));
            }
            setEditSubjectModal(false);
          }}
        />
      </View>
    );
  }

  // ── Topics view (inside a subject) ──
  const allRevCount = selectedGroup.topics.reduce((s, t) => s + (t.sessions?.length || 0), 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 6, borderBottomColor: colors.border }]}>
        {topicSelectMode ? (
          <View style={styles.selectHeader}>
            <Pressable onPress={handleCancelTopicSelect} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.selectCount, { color: colors.foreground }]}>
              {selectedTopicIds.size} selected
            </Text>
            <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
              {selectedTopicIds.size === 1 && (
                <Pressable
                  onPress={() => {
                    const id = Array.from(selectedTopicIds)[0]!;
                    const topic = selectedGroup?.topics.find((t) => t.id === id);
                    if (topic) { setEditTopicName(topic.topicName); setEditTopicModal(true); }
                  }}
                  hitSlop={10}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Feather name="edit-2" size={22} color="#22d3ee" />
                </Pressable>
              )}
              <Pressable
                onPress={() => selectedTopicIds.size > 0 && setShowTopicDeleteConfirm(true)}
                hitSlop={10}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Feather name="trash-2" size={22} color={selectedTopicIds.size > 0 ? "#ef4444" : colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.topicsHeaderRow}>
            <Pressable
              onPress={handleBackFromTopics}
              hitSlop={12}
              style={({ pressed }) => [styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.topicsTitle, { color: colors.accent }]} numberOfLines={1}>
                {selectedGroup.subject}
              </Text>
              <Text style={[styles.topicsSub, { color: colors.mutedForeground }]}>
                {selectedGroup.topics.length} {selectedGroup.topics.length === 1 ? "topic" : "topics"} · {allRevCount} revisions
              </Text>
            </View>
          </View>
        )}

        {/* Search bar */}
        {!topicSelectMode ? (
          <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search topics…"
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <Feather name="x-circle" size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <FlatList
        data={filteredTopics}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: bottomInset + 32 }}
        ListEmptyComponent={
          <View style={[styles.emptyWrap, { paddingTop: 60 }]}>
            <Feather name="file-text" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {searchQuery ? "No topics match your search." : "No topics yet."}
            </Text>
            {!searchQuery ? (
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Start a focus session to add topics here.
              </Text>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
        renderItem={({ item, index }) => {
          const initials = getInitials(item.topicName);
          const avatarBg = getAvatarColor(item.topicName, index);
          const revCount = item.sessions?.length || 0;
          const totalMin = item.totalMinutesStudied || 0;
          const isSelected = selectedTopicIds.has(item.id);

          const nextReview = item.nextReviewAt
            ? new Date(item.nextReviewAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : "Not scheduled";
          const isOverdue = item.nextReviewAt !== null && item.nextReviewAt < Date.now();

          return (
            <Pressable
              onPress={() => handleTopicTap(item)}
              onLongPress={() => handleTopicLongPress(item.id)}
              delayLongPress={350}
              style={({ pressed }) => [
                styles.listRow,
                { backgroundColor: isSelected ? colors.card : "transparent" },
                pressed && { backgroundColor: colors.card },
              ]}
            >
              {/* Avatar / checkbox */}
              <View style={styles.avatarCol}>
                {topicSelectMode ? (
                  <View style={[
                    styles.checkbox,
                    {
                      borderColor: isSelected ? "#22d3ee" : colors.border,
                      backgroundColor: isSelected ? "#22d3ee" : "transparent",
                    }
                  ]}>
                    {isSelected ? <Feather name="check" size={14} color="#0b1020" /> : null}
                  </View>
                ) : (
                  <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                )}
              </View>

              {/* Content */}
              <View style={styles.listContent}>
                <View style={styles.listTop}>
                  <Text style={[styles.listTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {item.topicName}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <Text style={[styles.listTime, { color: colors.mutedForeground }]}>
                      {fmtTime(totalMin)}
                    </Text>
                    {revCount > 0 ? (
                      <Text style={[styles.listTime, { color: colors.mutedForeground }]}>
                        R{revCount}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.listBottom}>
                  <Text
                    style={[styles.listSub, { color: isOverdue ? "#ef4444" : colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {item.suspendedUntil && item.suspendedUntil > Date.now()
                    ? "⏸ Paused · resumes after exam"
                    : `${isOverdue ? "⚠ " : ""}Next review: ${nextReview}${item.isImportant ? " · ⭐ priority" : ""}${item.disabled ? " · paused" : ""}`
                  }
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      <ExamSetupModal visible={examSetupVisible} onClose={() => setExamSetupVisible(false)} />

      <DeleteConfirmModal
        visible={showTopicDeleteConfirm}
        count={selectedTopicIds.size}
        kind="topic"
        onCancel={() => setShowTopicDeleteConfirm(false)}
        onConfirm={handleDeleteSelectedTopics}
      />

      <EditNameModal
        visible={editTopicModal}
        title="Rename Topic"
        value={editTopicName}
        onChange={setEditTopicName}
        onCancel={() => { setEditTopicModal(false); setEditTopicName(""); }}
        onConfirm={async () => {
          const id = Array.from(selectedTopicIds)[0];
          if (id && editTopicName.trim()) {
            await renameTopic(id, editTopicName.trim());
            setSelectedTopicIds(new Set([id]));
          }
          setEditTopicModal(false);
        }}
      />
    </View>
  );
}

// ── Edit Name Modal ───────────────────────────────────────────────────────────────
function EditNameModal({
  visible,
  title,
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              <Text style={[styles.modalTitle, { marginBottom: 16 }]}>{title}</Text>
              <TextInput
                style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={value}
                onChangeText={onChange}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={onConfirm}
              />
              <View style={styles.modalBtns}>
                <Pressable
                  onPress={onCancel}
                  style={({ pressed }) => [styles.modalBtnCancel, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onConfirm}
                  style={({ pressed }) => [styles.modalBtnConfirm, { opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={styles.modalBtnConfirmText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────────
function DeleteConfirmModal({
  visible,
  count,
  kind,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  count: number;
  kind: "subject" | "topic";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              <View style={styles.modalIcon}>
                <Feather name="trash-2" size={22} color="#ef4444" />
              </View>
              <Text style={styles.modalTitle}>
                Delete {count} {kind}{count !== 1 ? "s" : ""}?
              </Text>
              <Text style={styles.modalSub}>
                {kind === "subject"
                  ? `${count} subject${count !== 1 ? "s" : ""} and all their topics will be permanently deleted.`
                  : `${count} topic${count !== 1 ? "s" : ""} and all session data will be permanently deleted.`}
              </Text>
              <View style={styles.modalBtns}>
                <Pressable
                  onPress={onCancel}
                  style={({ pressed }) => [styles.modalBtnCancel, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onConfirm}
                  style={({ pressed }) => [styles.modalBtnConfirm, { opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={styles.modalBtnConfirmText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  screenTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    letterSpacing: -0.5,
    flex: 1,
  },

  examToggle: { alignItems: "flex-end", gap: 6 },
  modePill: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  modeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  modeOptionText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  examDateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  examDateChipText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  examSubjectSection: { gap: 6 },
  examSubjectLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  examChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  examChipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    padding: 0,
  },

  selectHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  selectCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },

  topicsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 2,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  topicsTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.3,
  },
  topicsSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 1,
  },

  /* List row */
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 72,
  },
  avatarCol: {
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: 0.5,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    flex: 1,
    gap: 4,
  },
  listTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  listTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    flex: 1,
  },
  listTime: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flexShrink: 0,
  },
  listBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  listSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    flex: 1,
  },

  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 80,
  },

  emptyWrap: {
    alignItems: "center",
    gap: 10,
    padding: 32,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    textAlign: "center",
  },
  emptySub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 22,
    backgroundColor: "#1c1f2e",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.15)",
    gap: 12,
    alignItems: "center",
  },
  dateModalCard: {
    backgroundColor: "#0b1020",
    gap: 14,
  },
  dateModalTitle: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    alignSelf: "flex-start",
  },
  modalIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    letterSpacing: -0.4,
    color: "#f8fafc",
    textAlign: "center",
  },
  modalSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: "#94a3b8",
    textAlign: "center",
  },
  modalBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    width: "100%",
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    alignItems: "center",
  },
  modalBtnCancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#f8fafc",
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  modalBtnConfirmText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },

  editInput: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: "100%",
  },

  /* Date picker */
  datePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
  },
  dateUnit: { alignItems: "center", gap: 6 },
  arrowBtn: { padding: 4 },
  dateUnitValue: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 18 },
  dateUnitLabel: { color: "#94a3b8", fontFamily: "Inter_500Medium", fontSize: 12 },
  dateSep: { color: "#64748b", fontSize: 22, fontFamily: "Inter_700Bold" },
  accent: { color: "#22d3ee" },
});
