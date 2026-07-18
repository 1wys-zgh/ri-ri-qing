package com.dayclear.ririqing;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public class MainActivity extends Activity {
    private static final int PICK_AUDIO_REQUEST = 2001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 2002;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(36, 79, 64));
        getWindow().setNavigationBarColor(Color.rgb(244, 240, 231));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AndroidBridge(), "DayclearAndroid");
        webView.setBackgroundColor(Color.rgb(244, 240, 231));
        setContentView(webView);
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    private void chooseMusic() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        startActivityForResult(intent, PICK_AUDIO_REQUEST);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_AUDIO_REQUEST || resultCode != RESULT_OK || data == null || data.getData() == null) {
            return;
        }

        Uri uri = data.getData();
        String displayName = readDisplayName(uri);
        File destination = new File(getFilesDir(), "reminder_music");
        try (InputStream input = getContentResolver().openInputStream(uri);
             FileOutputStream output = new FileOutputStream(destination, false)) {
            if (input == null) throw new IllegalStateException("Cannot open selected audio");
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            SharedPreferences preferences = getSharedPreferences(ReminderScheduler.PREFERENCES_NAME, MODE_PRIVATE);
            preferences.edit()
                    .putString(ReminderScheduler.MUSIC_PATH_KEY, destination.getAbsolutePath())
                    .putString(ReminderScheduler.MUSIC_NAME_KEY, displayName)
                    .apply();
            notifyMusicSelected(displayName);
        } catch (Exception error) {
            notifyMusicError("音乐保存失败，请检查手机剩余空间后重试。");
        }
    }

    private String readDisplayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        }
        return "自定义提醒音乐";
    }

    private void notifyMusicSelected(String name) {
        String script = "window.__dayclearMusicSelected && window.__dayclearMusicSelected(" + JSONObject.quote(name) + ")";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void notifyMusicError(String message) {
        String script = "window.__dayclearMusicError && window.__dayclearMusicError(" + JSONObject.quote(message) + ")";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void requestReminderAccess() {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AlarmManager alarmManager = (AlarmManager) getSystemService(ALARM_SERVICE);
                if (!alarmManager.canScheduleExactAlarms()) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            }
        });
    }

    public final class AndroidBridge {
        @JavascriptInterface
        public void syncReminders(String payload) {
            ReminderScheduler.sync(MainActivity.this, payload);
        }

        @JavascriptInterface
        public void requestReminderAccess() {
            MainActivity.this.requestReminderAccess();
        }

        @JavascriptInterface
        public void chooseMusic() {
            runOnUiThread(MainActivity.this::chooseMusic);
        }

        @JavascriptInterface
        public String getMusicName() {
            return getSharedPreferences(ReminderScheduler.PREFERENCES_NAME, MODE_PRIVATE)
                    .getString(ReminderScheduler.MUSIC_NAME_KEY, "");
        }

        @JavascriptInterface
        public void clearMusic() {
            SharedPreferences preferences = getSharedPreferences(ReminderScheduler.PREFERENCES_NAME, MODE_PRIVATE);
            String path = preferences.getString(ReminderScheduler.MUSIC_PATH_KEY, "");
            if (!path.isEmpty()) new File(path).delete();
            preferences.edit()
                    .remove(ReminderScheduler.MUSIC_PATH_KEY)
                    .remove(ReminderScheduler.MUSIC_NAME_KEY)
                    .apply();
            ReminderService.stop(MainActivity.this);
        }

        @JavascriptInterface
        public void testMusic() {
            ReminderService.play(MainActivity.this, "提醒音乐试听");
        }

        @JavascriptInterface
        public void stopMusic() {
            ReminderService.stop(MainActivity.this);
        }
    }
}
