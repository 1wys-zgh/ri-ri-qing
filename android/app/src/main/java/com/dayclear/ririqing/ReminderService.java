package com.dayclear.ririqing;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.io.File;

public class ReminderService extends Service {
    private static final String CHANNEL_ID = "dayclear_reminders";
    private static final int NOTIFICATION_ID = 7018;
    private static final String ACTION_PLAY = "com.dayclear.ririqing.PLAY";
    private static final String ACTION_STOP = "com.dayclear.ririqing.STOP";
    private MediaPlayer mediaPlayer;

    public static void play(Context context, String title) {
        boolean playSound = context.getSharedPreferences(ReminderScheduler.PREFERENCES_NAME, MODE_PRIVATE)
                .getBoolean(ReminderScheduler.SOUND_ENABLED_KEY, true);
        Intent intent = new Intent(context, ReminderService.class)
                .setAction(ACTION_PLAY)
                .putExtra("title", title)
                .putExtra("play_sound", playSound);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        Intent intent = new Intent(context, ReminderService.class).setAction(ACTION_STOP);
        context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "任务到点提醒",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("日日清任务和自定义音乐提醒");
        channel.setSound(null, null);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopPlayback(true);
            return START_NOT_STICKY;
        }

        String title = intent == null ? "今天的任务到时间了" : intent.getStringExtra("title");
        if (title == null || title.isEmpty()) title = "今天的任务到时间了";
        boolean playSound = intent == null || intent.getBooleanExtra("play_sound", true);
        startForeground(NOTIFICATION_ID, buildNotification(title, playSound));
        if (playSound) {
            startPlayback();
        } else {
            stopForeground(STOP_FOREGROUND_DETACH);
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String title, boolean ongoing) {
        Intent openIntent = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent stopIntent = new Intent(this, ReminderService.class).setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
                this,
                1,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("到时间了 · " + title)
                .setContentText("完成后记得回到日日清打卡")
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(ongoing)
                .setContentIntent(openPendingIntent)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_pause, "停止音乐", stopPendingIntent).build())
                .build();
    }

    private void startPlayback() {
        releasePlayer();
        try {
            String path = getSharedPreferences(ReminderScheduler.PREFERENCES_NAME, MODE_PRIVATE)
                    .getString(ReminderScheduler.MUSIC_PATH_KEY, "");
            Uri source;
            if (!path.isEmpty() && new File(path).exists()) {
                source = Uri.fromFile(new File(path));
            } else {
                source = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (source == null) source = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
            mediaPlayer.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            mediaPlayer.setDataSource(this, source);
            mediaPlayer.setLooping(false);
            mediaPlayer.setOnCompletionListener(player -> stopPlayback(true));
            mediaPlayer.setOnErrorListener((player, what, extra) -> {
                stopPlayback(true);
                return true;
            });
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception error) {
            stopPlayback(false);
        }
    }

    private void releasePlayer() {
        if (mediaPlayer == null) return;
        try {
            mediaPlayer.stop();
        } catch (IllegalStateException ignored) {
            // The player may already be stopped.
        }
        mediaPlayer.release();
        mediaPlayer = null;
    }

    private void stopPlayback(boolean removeNotification) {
        releasePlayer();
        stopForeground(removeNotification ? STOP_FOREGROUND_REMOVE : STOP_FOREGROUND_DETACH);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
