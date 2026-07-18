package com.dayclear.ririqing;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public final class ReminderScheduler {
    public static final String PREFERENCES_NAME = "dayclear_android";
    public static final String MUSIC_PATH_KEY = "music_path";
    public static final String MUSIC_NAME_KEY = "music_name";
    public static final String SOUND_ENABLED_KEY = "sound_enabled";
    private static final String PAYLOAD_KEY = "reminder_payload";
    private static final String REQUEST_CODES_KEY = "alarm_request_codes";

    private ReminderScheduler() {}

    public static synchronized void sync(Context context, String payload) {
        boolean soundEnabled = true;
        try {
            soundEnabled = new JSONObject(payload).optBoolean("soundEnabled", true);
        } catch (Exception ignored) {
            // Keep sound enabled when older saved data has no setting.
        }
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PAYLOAD_KEY, payload)
                .putBoolean(SOUND_ENABLED_KEY, soundEnabled)
                .apply();
        schedule(context, payload);
    }

    public static synchronized void restore(Context context) {
        String payload = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                .getString(PAYLOAD_KEY, "");
        if (!payload.isEmpty()) schedule(context, payload);
    }

    private static void schedule(Context context, String payload) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
        cancelExisting(context, alarmManager, preferences.getStringSet(REQUEST_CODES_KEY, new HashSet<>()));
        Set<String> nextRequestCodes = new HashSet<>();

        try {
            JSONObject root = new JSONObject(payload);
            if (!root.optBoolean("enabled", false)) {
                preferences.edit().putStringSet(REQUEST_CODES_KEY, nextRequestCodes).apply();
                return;
            }

            JSONArray tasks = root.optJSONArray("tasks");
            if (tasks == null) return;
            for (int index = 0; index < tasks.length(); index += 1) {
                JSONObject task = tasks.getJSONObject(index);
                String id = task.getString("id");
                String title = task.getString("title");
                long triggerAt = nextTrigger(task);
                if (triggerAt <= 0) continue;

                int requestCode = id.hashCode() & 0x7fffffff;
                Intent intent = new Intent(context, AlarmReceiver.class)
                        .putExtra("task_id", id)
                        .putExtra("task_title", title);
                PendingIntent pendingIntent = PendingIntent.getBroadcast(
                        context,
                        requestCode,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );

                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
                } else {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
                }
                nextRequestCodes.add(Integer.toString(requestCode));
            }
            preferences.edit().putStringSet(REQUEST_CODES_KEY, nextRequestCodes).apply();
        } catch (Exception ignored) {
            preferences.edit().putStringSet(REQUEST_CODES_KEY, nextRequestCodes).apply();
        }
    }

    private static void cancelExisting(Context context, AlarmManager alarmManager, Set<String> requestCodes) {
        for (String value : requestCodes) {
            try {
                int requestCode = Integer.parseInt(value);
                Intent intent = new Intent(context, AlarmReceiver.class);
                PendingIntent pendingIntent = PendingIntent.getBroadcast(
                        context,
                        requestCode,
                        intent,
                        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                );
                if (pendingIntent != null) {
                    alarmManager.cancel(pendingIntent);
                    pendingIntent.cancel();
                }
            } catch (NumberFormatException ignored) {
                // Ignore a damaged saved request code.
            }
        }
    }

    private static long nextTrigger(JSONObject task) throws Exception {
        String[] time = task.getString("time").split(":");
        int hour = Integer.parseInt(time[0]);
        int minute = Integer.parseInt(time[1]);
        String repeat = task.optString("repeat", "daily");
        Set<String> completedDates = new HashSet<>();
        JSONArray completed = task.optJSONArray("completedDates");
        if (completed != null) {
            for (int index = 0; index < completed.length(); index += 1) {
                completedDates.add(completed.getString(index));
            }
        }

        long now = System.currentTimeMillis();
        Calendar cursor = Calendar.getInstance();
        cursor.set(Calendar.HOUR_OF_DAY, hour);
        cursor.set(Calendar.MINUTE, minute);
        cursor.set(Calendar.SECOND, 0);
        cursor.set(Calendar.MILLISECOND, 0);

        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        for (int attempt = 0; attempt < 14; attempt += 1) {
            int day = cursor.get(Calendar.DAY_OF_WEEK);
            boolean weekday = day != Calendar.SATURDAY && day != Calendar.SUNDAY;
            boolean active = !"weekdays".equals(repeat) || weekday;
            String date = dateFormat.format(cursor.getTime());
            if (cursor.getTimeInMillis() > now && active && !completedDates.contains(date)) {
                return cursor.getTimeInMillis();
            }
            cursor.add(Calendar.DAY_OF_MONTH, 1);
        }
        return -1;
    }
}
