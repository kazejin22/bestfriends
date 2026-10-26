// Isi `text` dengan baris lirik kamu, sesuai urutan.
// `scene` = animasi yang dipakai baris itu (lihat SCENES di main.js).
// `time`  = kapan baris mulai di lagu: '0:06' (menit:detik) atau 6 (detik).
//           Kalau AUDIO_SRC diisi dan semua `time` terisi, lirik otomatis ganti
//           mengikuti lagu. Buka localhost:8000/?timing untuk merekam waktunya.

export const AUDIO_SRC = 'song.mp3'; // contoh: 'song.mp3' (taruh file-nya di folder ini)

export const LYRICS = [
  { scene: 'happy',    time: '0:00', text: 'I say that Im happy' },
  { scene: 'happy2',   time: '0:03', text: 'I say that Im happy' },
  { scene: 'no',       time: '0:06', text: 'But no, no, no, no' },
  { scene: 'nofall',   time: '0:10', text: 'No, no, no' },
  { scene: 'favorite', time: '0:12', text: 'Oh, I still wanna be your favorite boy' },
  { scene: 'day',      time: '0:19', text: 'I wanna be the one that makes your day' },
  { scene: 'awake',    time: '0:22', text: 'The one you think about as you lie awake' },
  { scene: 'one',      time: '0:26', text: 'And I cant wait to be your number, your number one' },
  { scene: 'fan',      time: '0:32', text: 'I ll be your biggest fan and you ll be mine' },
  { scene: 'cry',      time: '0:35', text: 'But I still wanna break your heart and make you cry' },
];
