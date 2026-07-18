"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Category = "重要" | "工作" | "健康" | "成长" | "生活";
type Repeat = "daily" | "weekdays";
type Filter = "all" | "todo" | "done";

declare global {
  interface Window {
    dayclearDesktop?: {
      isDesktop: boolean;
      getAutoStart: () => Promise<boolean>;
      setAutoStart: (enabled: boolean) => Promise<boolean>;
    };
    DayclearAndroid?: {
      syncReminders: (payload: string) => void;
      requestReminderAccess: () => void;
      chooseMusic: () => void;
      getMusicName: () => string;
      clearMusic: () => void;
      testMusic: () => void;
      stopMusic: () => void;
    };
    __dayclearMusicSelected?: (name: string) => void;
    __dayclearMusicError?: (message: string) => void;
  }
}

type Task = {
  id: string;
  title: string;
  note: string;
  time: string;
  category: Category;
  repeat: Repeat;
  completedDates: string[];
};

const DEFAULT_TASKS: Task[] = [
  {
    id: "morning-plan",
    title: "写下今天最重要的 3 件事",
    note: "先决定方向，再开始忙碌",
    time: "07:30",
    category: "重要",
    repeat: "daily",
    completedDates: [],
  },
  {
    id: "deep-work",
    title: "完成今天最重要的一件事",
    note: "专注 45 分钟，暂时关掉消息",
    time: "10:00",
    category: "工作",
    repeat: "weekdays",
    completedDates: [],
  },
  {
    id: "move-water",
    title: "喝水并起身活动 10 分钟",
    note: "肩颈放松一下，眼睛看看远处",
    time: "14:00",
    category: "健康",
    repeat: "daily",
    completedDates: [],
  },
  {
    id: "evening-review",
    title: "整理成果，写下明天第一件事",
    note: "用 5 分钟给今天收个尾",
    time: "19:30",
    category: "成长",
    repeat: "daily",
    completedDates: [],
  },
  {
    id: "sleep-winddown",
    title: "放下手机，准备好好睡觉",
    note: "给大脑留一段安静的时间",
    time: "22:30",
    category: "生活",
    repeat: "daily",
    completedDates: [],
  },
];

const CATEGORY_ICONS: Record<Category, string> = {
  重要: "✦",
  工作: "⌁",
  健康: "☘",
  成长: "↗",
  生活: "☾",
};

const STORAGE_KEY = "dayclear-tasks-v1";
const SETTINGS_KEY = "dayclear-settings-v1";
const MUSIC_DB_NAME = "dayclear-reminder-audio";
const MUSIC_STORE_NAME = "audio";
const MUSIC_RECORD_KEY = "selected-music";

type StoredMusic = {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  updatedAt: number;
};

function openMusicDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(MUSIC_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MUSIC_STORE_NAME)) {
        request.result.createObjectStore(MUSIC_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredMusic() {
  const database = await openMusicDatabase();
  return new Promise<StoredMusic | null>((resolve, reject) => {
    const transaction = database.transaction(MUSIC_STORE_NAME, "readonly");
    const request = transaction.objectStore(MUSIC_STORE_NAME).get(MUSIC_RECORD_KEY);
    request.onsuccess = () => resolve((request.result as StoredMusic | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function storeMusic(file: File) {
  const database = await openMusicDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MUSIC_STORE_NAME, "readwrite");
    transaction.objectStore(MUSIC_STORE_NAME).put({
      id: MUSIC_RECORD_KEY,
      name: file.name,
      type: file.type,
      blob: file,
      updatedAt: Date.now(),
    } satisfies StoredMusic);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function removeStoredMusic() {
  const database = await openMusicDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MUSIC_STORE_NAME, "readwrite");
    transaction.objectStore(MUSIC_STORE_NAME).delete(MUSIC_RECORD_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isActiveOn(task: Task, date: Date) {
  const day = date.getDay();
  return task.repeat === "daily" || (day >= 1 && day <= 5);
}

function dueAt(task: Task, date: Date) {
  const [hours, minutes] = task.time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function greeting(hour: number) {
  if (hour < 6) return "夜深了，先照顾好自己";
  if (hour < 11) return "早上好，今天从容一点";
  if (hour < 14) return "中午好，记得稍作休息";
  if (hour < 18) return "下午好，继续稳稳向前";
  return "晚上好，给今天好好收尾";
}

function formatRemaining(ms: number) {
  const absolute = Math.abs(ms);
  const hours = Math.floor(absolute / 3_600_000);
  const minutes = Math.max(1, Math.floor((absolute % 3_600_000) / 60_000));
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function createId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(DEFAULT_TASKS);
  const [now, setNow] = useState(() => new Date(0));
  const [hydrated, setHydrated] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeAlert, setActiveAlert] = useState<Task | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [snoozes, setSnoozes] = useState<Record<string, number>>({});
  const [musicName, setMusicName] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicError, setMusicError] = useState("");
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isDesktop] = useState(() => Boolean(window.dayclearDesktop?.isDesktop));
  const [isAndroid] = useState(() => Boolean(window.DayclearAndroid));
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const lastCheckRef = useRef(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    title: "",
    note: "",
    time: "09:00",
    category: "重要" as Category,
    repeat: "daily" as Repeat,
  });

  useEffect(() => {
    try {
      const savedTasks = localStorage.getItem(STORAGE_KEY);
      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedTasks) setTasks(JSON.parse(savedTasks));
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setRemindersEnabled(Boolean(settings.remindersEnabled));
        setSoundEnabled(settings.soundEnabled !== false);
      }
    } catch {
      // Keep the friendly defaults if saved data cannot be read.
    }
    setNow(new Date());
    setHydrated(true);
    if (window.DayclearAndroid) {
      setMusicName(window.DayclearAndroid.getMusicName() || "");
    } else {
      void readStoredMusic()
        .then((record) => {
          if (!record) return;
          setMusicName(record.name);
          setMusicUrl(URL.createObjectURL(record.blob));
        })
        .catch(() => setMusicError("无法读取已保存的音乐，请重新选择。"));
    }
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!window.dayclearDesktop) return;
    void window.dayclearDesktop.getAutoStart().then(setAutoStartEnabled).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isAndroid) return;
    window.__dayclearMusicSelected = (name) => {
      setMusicName(name);
      setMusicError("");
      setSoundEnabled(true);
    };
    window.__dayclearMusicError = setMusicError;
    return () => {
      delete window.__dayclearMusicSelected;
      delete window.__dayclearMusicError;
    };
  }, [isAndroid]);

  useEffect(() => {
    return () => {
      if (musicUrl) URL.revokeObjectURL(musicUrl);
    };
  }, [musicUrl]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ remindersEnabled, soundEnabled }),
    );
  }, [remindersEnabled, soundEnabled, hydrated]);

  useEffect(() => {
    if (!hydrated || !isAndroid || !window.DayclearAndroid) return;
    window.DayclearAndroid.syncReminders(JSON.stringify({
      enabled: remindersEnabled,
      soundEnabled,
      tasks: tasks.map(({ id, title, time, repeat, completedDates }) => ({
        id,
        title,
        time,
        repeat,
        completedDates,
      })),
    }));
  }, [tasks, remindersEnabled, soundEnabled, hydrated, isAndroid]);

  const today = dateKey(now);
  const todayTasks = useMemo(
    () => tasks.filter((task) => isActiveOn(task, now)).sort((a, b) => a.time.localeCompare(b.time)),
    [tasks, now.getDay()],
  );
  const completedCount = todayTasks.filter((task) => task.completedDates.includes(today)).length;
  const progress = todayTasks.length ? Math.round((completedCount / todayTasks.length) * 100) : 0;
  const unfinished = todayTasks.filter((task) => !task.completedDates.includes(today));
  const overdue = unfinished.filter((task) => dueAt(task, now).getTime() < now.getTime());
  const nextTask = unfinished[0] ?? null;
  const hasCustomMusic = isAndroid ? Boolean(musicName) : Boolean(musicUrl);

  const visibleTasks = todayTasks.filter((task) => {
    const done = task.completedDates.includes(today);
    if (filter === "done") return done;
    if (filter === "todo") return !done;
    return true;
  });

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = dateKey(date);
      const active = tasks.filter((task) => isActiveOn(task, date));
      const done = active.filter((task) => task.completedDates.includes(key)).length;
      return {
        key,
        day: "日一二三四五六"[date.getDay()],
        date: date.getDate(),
        isToday: key === today,
        complete: active.length > 0 && done === active.length,
        partial: done > 0 && done < active.length,
      };
    });
  }, [tasks, today, now.getDay()]);

  const streak = useMemo(() => {
    let count = 0;
    const cursor = new Date(now);
    cursor.setHours(12, 0, 0, 0);
    for (let i = 0; i < 365; i += 1) {
      const key = dateKey(cursor);
      const active = tasks.filter((task) => isActiveOn(task, cursor));
      const perfect = active.length > 0 && active.every((task) => task.completedDates.includes(key));
      if (key === today && !perfect) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      if (!perfect) break;
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [tasks, today, now]);

  function playChime() {
    if (!soundEnabled) return;
    try {
      const AudioCtor = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const context = audioContextRef.current ?? new AudioCtor();
      audioContextRef.current = context;
      [0, 0.16].forEach((delay, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = index === 0 ? 660 : 880;
        gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.3);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(context.currentTime + delay);
        oscillator.stop(context.currentTime + delay + 0.32);
      });
    } catch {
      // Page reminders still work when audio is unavailable.
    }
  }

  function stopCustomMusic() {
    if (isAndroid) {
      window.DayclearAndroid?.stopMusic();
    }
    const audio = customAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      customAudioRef.current = null;
    }
    setIsMusicPlaying(false);
  }

  async function playCustomMusic(source = musicUrl) {
    if (!soundEnabled) return false;
    if (isAndroid) {
      window.DayclearAndroid?.testMusic();
      setIsMusicPlaying(true);
      return true;
    }
    if (!source) return false;
    stopCustomMusic();
    try {
      const audio = new Audio(source);
      customAudioRef.current = audio;
      audio.onended = () => {
        customAudioRef.current = null;
        setIsMusicPlaying(false);
      };
      audio.onerror = () => {
        customAudioRef.current = null;
        setIsMusicPlaying(false);
        setMusicError("浏览器无法播放这个音频格式，请换一个文件。" );
      };
      await audio.play();
      setIsMusicPlaying(true);
      return true;
    } catch {
      customAudioRef.current = null;
      setIsMusicPlaying(false);
      setMusicError("浏览器阻止了自动播放，请点击“测试提醒”后再试。" );
      return false;
    }
  }

  async function playReminderSound() {
    if (!soundEnabled) return;
    if (isAndroid) {
      window.DayclearAndroid?.testMusic();
      setIsMusicPlaying(true);
      return;
    }
    if (musicUrl) {
      const played = await playCustomMusic();
      if (played) return;
    }
    playChime();
  }

  async function handleMusicUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setMusicError("请选择 MP3、M4A、WAV、OGG 等音频文件。" );
      return;
    }

    try {
      await storeMusic(file);
      stopCustomMusic();
      const nextUrl = URL.createObjectURL(file);
      setMusicUrl(nextUrl);
      setMusicName(file.name);
      setMusicError("");
      setSoundEnabled(true);
      await playCustomMusic(nextUrl);
    } catch {
      setMusicError("音乐没有保存成功，可能是文件超过了浏览器可用存储空间。" );
    }
  }

  async function clearCustomMusic() {
    stopCustomMusic();
    if (isAndroid) {
      window.DayclearAndroid?.clearMusic();
      setMusicName("");
      setMusicError("");
      return;
    }
    await removeStoredMusic().catch(() => undefined);
    setMusicUrl("");
    setMusicName("");
    setMusicError("");
  }

  useEffect(() => {
    if (!hydrated) return;
    const currentTime = now.getTime();
    if (!remindersEnabled) {
      lastCheckRef.current = currentTime;
      return;
    }
    if (isAndroid) {
      lastCheckRef.current = currentTime;
      return;
    }

    const dueCandidate = todayTasks.find((task) => {
      if (task.completedDates.includes(today)) return false;
      const dueTime = dueAt(task, now).getTime();
      const crossedDueTime = dueTime > lastCheckRef.current && dueTime <= currentTime;
      const snoozedUntil = snoozes[task.id];
      return crossedDueTime || Boolean(snoozedUntil && snoozedUntil <= currentTime);
    });

    lastCheckRef.current = currentTime;
    if (!dueCandidate) return;

    setSnoozes((previous) => {
      const next = { ...previous };
      delete next[dueCandidate.id];
      return next;
    });
    setActiveAlert(dueCandidate);
    void playReminderSound();

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`到时间了 · ${dueCandidate.title}`, {
        body: `${dueCandidate.time} 的任务正在等你，完成后记得回来打卡。`,
        icon: "./favicon.svg",
        tag: `dayclear-${dueCandidate.id}-${today}`,
      });
    }
  }, [now, remindersEnabled, hydrated, todayTasks, today, snoozes, isAndroid]);

  async function enableReminders() {
    lastCheckRef.current = Date.now();
    if (isAndroid) {
      window.DayclearAndroid?.requestReminderAccess();
    } else if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    setRemindersEnabled(true);
    await playReminderSound();
  }

  function disableReminders() {
    setRemindersEnabled(false);
    stopCustomMusic();
  }

  function dismissAlert() {
    stopCustomMusic();
    setActiveAlert(null);
  }

  async function toggleAutoStart(enabled: boolean) {
    if (!window.dayclearDesktop) return;
    const actualValue = await window.dayclearDesktop.setAutoStart(enabled).catch(() => !enabled);
    setAutoStartEnabled(actualValue);
  }

  function toggleTask(task: Task) {
    const isDone = task.completedDates.includes(today);
    setTasks((current) =>
      current.map((item) => {
        if (item.id !== task.id) return item;
        const completedDates = isDone
          ? item.completedDates.filter((date) => date !== today)
          : [...new Set([...item.completedDates, today])].slice(-90);
        return { ...item, completedDates };
      }),
    );
    if (!isDone) {
      setCelebration(task.title);
      window.setTimeout(() => setCelebration(null), 2200);
      if (activeAlert?.id === task.id) dismissAlert();
    }
  }

  function openAddModal() {
    setEditingTask(null);
    setForm({ title: "", note: "", time: "09:00", category: "重要", repeat: "daily" });
    setModalOpen(true);
  }

  function openEditModal(task: Task) {
    setEditingTask(task);
    setForm({
      title: task.title,
      note: task.note,
      time: task.time,
      category: task.category,
      repeat: task.repeat,
    });
    setModalOpen(true);
  }

  function saveTask(event: FormEvent) {
    event.preventDefault();
    const cleanTitle = form.title.trim();
    if (!cleanTitle) return;
    if (editingTask) {
      setTasks((current) =>
        current.map((task) =>
          task.id === editingTask.id ? { ...task, ...form, title: cleanTitle, note: form.note.trim() } : task,
        ),
      );
    } else {
      setTasks((current) => [
        ...current,
        { ...form, id: createId(), title: cleanTitle, note: form.note.trim(), completedDates: [] },
      ]);
    }
    setModalOpen(false);
  }

  function removeTask(task: Task) {
    if (!window.confirm(`确定删除“${task.title}”吗？`)) return;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setModalOpen(false);
  }

  function snoozeTask(task: Task) {
    setSnoozes((current) => ({ ...current, [task.id]: Date.now() + 5 * 60_000 }));
    dismissAlert();
  }

  if (!hydrated) {
    return (
      <main className="loading-shell">
        <div className="loading-mark">日</div>
        <p>正在整理今天的安排…</p>
      </main>
    );
  }

  const nextDue = nextTask ? dueAt(nextTask, now).getTime() - now.getTime() : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#today" aria-label="日日清首页">
          <span className="brand-mark">日</span>
          <span>
            <strong>日日清</strong>
            <small>今天的事，今天安心完成</small>
          </span>
        </a>
        <div className="top-actions">
          <button
            className={`reminder-button ${remindersEnabled ? "is-on" : ""}`}
            onClick={remindersEnabled ? disableReminders : enableReminders}
            type="button"
          >
            <span aria-hidden="true">{remindersEnabled ? "●" : "◌"}</span>
            {remindersEnabled ? "提醒已开启" : "开启到点提醒"}
          </button>
          <button className="add-button" onClick={openAddModal} type="button">
            <span aria-hidden="true">＋</span> 新建任务
          </button>
        </div>
      </header>

      <section className="hero" id="today">
        <div className="hero-copy">
          <p className="eyebrow">{dayLabel(now)} · {now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</p>
          <h1>{greeting(now.getHours())}</h1>
          <p className="hero-subtitle">
            不必一下子完成所有事。看清下一件，然后开始。
          </p>
        </div>
        <div className="progress-orbit" aria-label={`今日完成 ${progress}%`}>
          <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
            <circle className="orbit-track" cx="60" cy="60" r="50" />
            <circle
              className="orbit-fill"
              cx="60"
              cy="60"
              r="50"
              pathLength="100"
              strokeDasharray={`${progress} 100`}
            />
          </svg>
          <div>
            <strong>{progress}%</strong>
            <span>{completedCount}/{todayTasks.length} 已完成</span>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="main-column">
          <section className={`focus-card ${overdue.length ? "is-overdue" : ""}`} aria-labelledby="focus-title">
            <div className="focus-heading">
              <span className="focus-kicker">{overdue.length ? "现在就从这一件开始" : "接下来要做"}</span>
              {nextTask && (
                <span className="countdown">
                  {nextDue < 0 ? `已过 ${formatRemaining(nextDue)}` : `${formatRemaining(nextDue)}后`}
                </span>
              )}
            </div>
            {nextTask ? (
              <div className="focus-content">
                <button
                  className="focus-check"
                  onClick={() => toggleTask(nextTask)}
                  aria-label={`完成 ${nextTask.title}`}
                  type="button"
                >
                  ✓
                </button>
                <div className="focus-details">
                  <div className="focus-meta">
                    <time>{nextTask.time}</time>
                    <span>{CATEGORY_ICONS[nextTask.category]} {nextTask.category}</span>
                  </div>
                  <h2 id="focus-title">{nextTask.title}</h2>
                  <p>{nextTask.note || "完成以后，记得给自己一个小小的肯定。"}</p>
                </div>
              </div>
            ) : (
              <div className="all-done">
                <span>✓</span>
                <div>
                  <h2 id="focus-title">今天的任务全部完成</h2>
                  <p>做得很好。现在可以放心休息，也可以记录一点感受。</p>
                </div>
              </div>
            )}
          </section>

          <section className="task-section" aria-labelledby="task-list-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker">TODAY</p>
                <h2 id="task-list-title">今天的安排</h2>
              </div>
              <div className="filters" aria-label="筛选任务">
                {(["all", "todo", "done"] as Filter[]).map((item) => (
                  <button
                    className={filter === item ? "active" : ""}
                    onClick={() => setFilter(item)}
                    type="button"
                    key={item}
                  >
                    {item === "all" ? "全部" : item === "todo" ? "待完成" : "已完成"}
                  </button>
                ))}
              </div>
            </div>

            <div className="task-list">
              {visibleTasks.map((task) => {
                const done = task.completedDates.includes(today);
                const late = !done && dueAt(task, now).getTime() < now.getTime();
                return (
                  <article className={`task-row ${done ? "is-done" : ""}`} key={task.id}>
                    <button
                      className="task-check"
                      onClick={() => toggleTask(task)}
                      type="button"
                      aria-label={done ? `取消完成 ${task.title}` : `完成 ${task.title}`}
                      aria-pressed={done}
                    >
                      <span>✓</span>
                    </button>
                    <time className={late ? "late" : ""}>{task.time}</time>
                    <div className="task-copy">
                      <h3>{task.title}</h3>
                      <p>{task.note || "没有备注"}</p>
                    </div>
                    <span className={`category-tag category-${task.category}`}>{CATEGORY_ICONS[task.category]} {task.category}</span>
                    <button className="edit-task" onClick={() => openEditModal(task)} type="button" aria-label={`编辑 ${task.title}`}>•••</button>
                  </article>
                );
              })}
              {visibleTasks.length === 0 && (
                <div className="empty-list">
                  <span>☁</span>
                  <p>{filter === "done" ? "还没有已完成的任务，先从一件小事开始吧。" : "这里暂时没有任务。"}</p>
                </div>
              )}
            </div>
            <button className="quick-add" onClick={openAddModal} type="button">＋ 添加一件今天要做的事</button>
          </section>
        </div>

        <aside className="side-column">
          <section className="streak-card">
            <div className="streak-top">
              <div>
                <span className="side-label">连续打卡</span>
                <strong>{streak}<small> 天</small></strong>
              </div>
              <span className="streak-flame" aria-hidden="true">↗</span>
            </div>
            <p>{streak > 0 ? "你正在把认真变成一种习惯。" : "今天全部完成，就从第 1 天开始。"}</p>
            <div className="week-strip" aria-label="最近七天打卡情况">
              {weekDays.map((day) => (
                <div className={day.isToday ? "today" : ""} key={day.key}>
                  <span>周{day.day}</span>
                  <b className={day.complete ? "complete" : day.partial ? "partial" : ""}>
                    {day.complete ? "✓" : day.date}
                  </b>
                </div>
              ))}
            </div>
          </section>

          <section className="reminder-card">
            <div className="reminder-icon" aria-hidden="true">◴</div>
            <div>
              <span className="side-label">别怕忘记</span>
              <h2>{remindersEnabled ? "我会按时提醒你" : "把提醒打开吧"}</h2>
            </div>
            <p>
              {remindersEnabled
                ? isAndroid
                  ? "退出界面或锁屏后，Android 系统仍会到点播放完整音乐并通知你。"
                  : isDesktop
                  ? "即使关闭主窗口，到点也会播放你选择的完整音乐并弹出催办。"
                  : "页面打开时，到点会播放你选择的完整音乐并弹出催办。"
                : "开启提醒后，日日清会按任务时间催你完成并打卡。"}
            </p>
            <button className="test-reminder-button" onClick={enableReminders} type="button">
              {remindersEnabled ? "重新测试提醒" : "立即开启提醒"}
            </button>
            <div className="music-picker">
              <input
                ref={musicInputRef}
                className="music-file-input"
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"
                onChange={handleMusicUpload}
                aria-label="上传自己的提醒音乐"
              />
              <div className="music-copy">
                <span>自定义提醒音乐</span>
                <strong title={musicName}>{musicName || "还没有选择音乐"}</strong>
              </div>
              <div className="music-actions">
                {hasCustomMusic && (
                  <button
                    className="music-preview-button"
                    onClick={isMusicPlaying ? stopCustomMusic : () => void playCustomMusic()}
                    type="button"
                  >
                    {isMusicPlaying ? "停止" : "试听"}
                  </button>
                )}
                <button
                  className="music-upload-button"
                  onClick={() => isAndroid ? window.DayclearAndroid?.chooseMusic() : musicInputRef.current?.click()}
                  type="button"
                >
                  {hasCustomMusic ? "更换" : "选择音乐"}
                </button>
              </div>
            </div>
            {hasCustomMusic && (
              <button className="music-remove-button" onClick={() => void clearCustomMusic()} type="button">
                移除自定义音乐
              </button>
            )}
            {musicError && <p className="music-error" role="alert">{musicError}</p>}
            <p className="music-hint">
              {isAndroid
                ? "不限制播放时长；音乐会复制到手机应用私有空间，只受手机剩余存储空间限制。"
                : "不限制播放时长；音乐只保存在当前设备，文件大小受浏览器可用空间限制。"}
            </p>
            <label className="sound-toggle">
              <span>提示音</span>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(event) => setSoundEnabled(event.target.checked)}
              />
              <i aria-hidden="true" />
            </label>
            {isDesktop && (
              <label className="sound-toggle">
                <span>开机自动启动</span>
                <input
                  type="checkbox"
                  checked={autoStartEnabled}
                  onChange={(event) => void toggleAutoStart(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
            )}
            <div className="background-note">
              <strong>{isAndroid || isDesktop ? "后台提醒已开启" : "关于关闭页面"}</strong>
              <span>
                {isAndroid
                  ? "退出界面、锁屏或重新开机后仍会安排提醒；从系统设置“强行停止”应用后提醒会暂停。"
                  : isDesktop
                  ? "关闭窗口后会缩到系统托盘继续计时；只有从托盘选择“退出日日清”才会停止。"
                  : "网页被完全关闭后，浏览器不能持续计时或自动播放音乐。"}
              </span>
            </div>
          </section>

          <blockquote className="quote-card">
            <span>“</span>
            <p>完成比完美更重要，今天只要比昨天前进一点点。</p>
            <cite>今日小提醒</cite>
          </blockquote>
        </aside>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModalOpen(false)}>
          <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p>{editingTask ? "调整计划" : "安排一件事"}</p>
                <h2 id="modal-title">{editingTask ? "编辑任务" : "新建任务"}</h2>
              </div>
              <button onClick={() => setModalOpen(false)} type="button" aria-label="关闭">×</button>
            </div>
            <form onSubmit={saveTask}>
              <label>
                <span>要做什么</span>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="例如：完成项目方案第一稿"
                  maxLength={48}
                />
              </label>
              <label>
                <span>给自己一句提示（可选）</span>
                <input
                  value={form.note}
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                  placeholder="越具体，越容易开始"
                  maxLength={80}
                />
              </label>
              <div className="form-row">
                <label>
                  <span>提醒时间</span>
                  <input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required />
                </label>
                <label>
                  <span>任务分类</span>
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Category })}>
                    {(Object.keys(CATEGORY_ICONS) as Category[]).map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
              </div>
              <label>
                <span>重复</span>
                <select value={form.repeat} onChange={(event) => setForm({ ...form, repeat: event.target.value as Repeat })}>
                  <option value="daily">每天</option>
                  <option value="weekdays">仅工作日</option>
                </select>
              </label>
              <div className="modal-actions">
                {editingTask && <button className="delete-button" type="button" onClick={() => removeTask(editingTask)}>删除任务</button>}
                <button className="cancel-button" type="button" onClick={() => setModalOpen(false)}>取消</button>
                <button className="save-button" type="submit">{editingTask ? "保存修改" : "加入今天"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {activeAlert && (
        <div className="alert-toast" role="alert" aria-live="assertive">
          <div className="alert-pulse">!</div>
          <div className="alert-copy">
            <span>到时间了 · {activeAlert.time}</span>
            <strong>{activeAlert.title}</strong>
          </div>
          <button className="snooze-button" onClick={() => snoozeTask(activeAlert)} type="button">5 分钟后提醒</button>
          <button className="complete-button" onClick={() => toggleTask(activeAlert)} type="button">完成打卡</button>
          <button className="close-alert" onClick={dismissAlert} type="button" aria-label="关闭提醒并停止音乐">×</button>
        </div>
      )}

      {celebration && (
        <div className="celebration" role="status">
          <span>✓</span>
          <div><strong>完成一件，轻松一点</strong><small>{celebration}</small></div>
        </div>
      )}
    </main>
  );
}
