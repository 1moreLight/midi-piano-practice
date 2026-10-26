# 琴房

对着导入的五线谱练琴的网页。谱停在一页上，弹对当前这一拍再进下一拍。适合视谱还不稳、手还停在中央 C 附近的人。

没有账号，也没有服务器。记录留在这台浏览器里。

## 怎么跑

需要 Node.js 20 以上。

```bash
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:4179 。Web MIDI 请用 Chrome 或 Edge。

```bash
npm test
npm run lint
npm run build
```

第一次出声会从 [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) 拉取 MusyngKite 钢琴采样。拉不下来时改用简易合成音色，键盘和记谱照常可用。

## 怎么练

1. 打开时先放着一份示例谱，中央 C 附近的大谱表。点「导入谱子」换上自己的 MusicXML（`.xml`、`.musicxml`）或压缩的 `.mxl`。谱上的音符、休止、和弦、连线、延音、力度、指法和踏板都按文件里写的来画，不另写一条旋律。
2. 绿色标出的是现在这一拍，键盘上对应的键整键变绿。用鼠标、电脑键盘（A 键是中央 C）或 MIDI 键盘弹。弹对了才往下走。
3. 左右手同时写出来的音要按齐。休止符点「走过休止」。延音线后面的音不用再弹，点「保持，下一音」。
4. 「只练白键」打开时，纯黑键的那一拍可以跳过。关掉之后按谱上的升降号弹。
5. 「显示音名」会把当前音的音名和简谱写出来。「在键盘上标出」会把当前音的键涂绿。两项都可以关掉。
6. 速度和节拍器只负责打拍，不判你有没有卡在拍点上。反复记号如果写在文件里，跟着谱面播放的顺序走。

中央 C 是 C4，MIDI 60。屏幕上是一架 88 键钢琴，从 A0 到 C8。窗口窄到放不下时可以横向滚动，打开时会停在中央 C。

## 练习记录

每个按下、松开，以及跟谱的对错，都会记下时间。页面上能看到最近几条。整段记录：

- **下载 JSON**：给之后的钢琴老师助手看
- **复制摘要**：一段中文，可以直接贴出去

JSON 形如：

```json
{
  "app": "qinfang",
  "schemaVersion": 1,
  "exportedAt": "2026-10-26T07:00:00.000Z",
  "session": {
    "id": "...",
    "startedAt": "2026-10-26T07:00:00.000Z",
    "bpm": 72,
    "recording": true,
    "events": [
      {
        "t": 1500,
        "type": "note-on",
        "midi": 60,
        "name": "C4",
        "jianpu": "1",
        "velocity": 80,
        "source": "midi"
      }
    ],
    "drill": {
      "range": [55, 65],
      "naturalsOnly": true,
      "correct": 1,
      "wrong": 0,
      "skips": 0,
      "streak": 1,
      "bestStreak": 1
    }
  }
}
```

`t` 是从 `startedAt` 起的毫秒。`source` 为 `midi` 或 `screen`（鼠标、触摸、电脑键盘）。屏幕没有力度，记成 96。`drill.result` 为 `correct`、`wrong` 或 `skip`。

超过 6 小时没有新音符，下次打开会另起一段，上一段还可以用「下载上一段」取出。

## 用到的开源项目

| 部分 | 项目 | 许可证 |
| --- | --- | --- |
| 读谱与排版 | [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) | BSD-3-Clause |
| 屏幕键盘 | [react-piano](https://github.com/kevinsqi/react-piano) | MIT |
| 钢琴采样播放 | [soundfont-player](https://github.com/danigb/soundfont-player) | MIT |
| 采样文件 | [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) MusyngKite | MIT |
| MIDI | [WEBMIDI.js](https://github.com/djipco/webmidi) | Apache-2.0 |
| 和弦与音名 | [tonal](https://github.com/tonaljs/tonal) | MIT |
| 节拍器 | [Tone.js](https://github.com/Tonejs/Tone.js) | MIT |

界面上的跟谱、记录和中文文案是在这些库上面写的。
