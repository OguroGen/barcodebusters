<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { MonsterStore } from "@/stores/monster";
import { supabase } from "@/supabase";

const router = useRouter();
const monsterStore = MonsterStore();

//定数
const SCREEN_SIZE_W = 800;
const SCREEN_SIZE_H = 500;
const SCREEN_BK_COLOR = "#66AAFF";
const MAX_ATTACK_SLOTS = 35;
const SLOT_SRC = [
  "/images/number_0.png",
  "/images/number_1.png",
  "/images/number_2.png",
  "/images/number_3.png",
  "/images/number_4.png",
  "/images/number_5.png",
  "/images/number_6.png",
  "/images/number_7.png",
  "/images/number_8.png",
  "/images/number_9.png",
  "/images/hoka_05_question.png",
  "/images/number_kanji11_hyaku.png",
];
const EXPLOSION_SRC = [
  "/images/bakuhatsu4.png",
  "/images/bakuhatsu2.png",
  "/images/bakuhatsu3.png",
  "/images/bakuhatsu1.png",
];

//DOM要素
const canvas = ref();
const startButton = ref();
const barcodeButton = ref();
const barcodeInput = ref();
const answerInput = ref();
const attackButton = ref();

//リアクティブ変数
const startCaption = ref("スタート");
const hantei = ref("");
const barcode = ref("");
const buttonCaption = ref("このボタンを押せ");
const inputedAnswer = ref("");
const information = ref("↑↑↑↑↑　スタートボタンを押してください　↑↑↑↑↑");

// 生徒情報（IDカードで取得、ストアは使わない）
const hasMember = ref(false);
const currentSeitoId = ref("");
const memberName = ref("");
const memberIconUrl = ref("");
const baisuruNormal = ref(0);
const kakuriaNormal = ref(0);
const chronoNormal = ref(0);
const slotPlusNormal = ref(0);
const memberError = ref("");
const answerMode = ref(false);
const answerSubmitted = ref(false); // 答え入力後はバイスル・カクリアボタンを無効化（クロノはいつでも可）。true のときに「このボタンを押せ」で resetMember

// ゲーム状態: idle | playing | timeUp | victory（クロノボタンの使用可否用）
const gamePhase = ref("idle");
const isGameActive = computed(() => gamePhase.value === "playing");
const isTimeUp = computed(() => gamePhase.value === "timeUp");

//変数、配列
let game;
let startTime;
let time;
let limitTime;
let canvasContext;
let correctAnswer = 0;
const mondaiLevel = ref(0);
let attackSlots = Array(MAX_ATTACK_SLOTS).fill(0);
let attacked = false;
const extraSlotsNextAttack = ref(0);
let effectiveSlotsUsed = 0;
const kaishinRate = ref(1);
let monsterHitpoint;
let attackPower;
const attackBonus = ref(1);
let explosion;
let dropItem = true;
let dropKaishin = true;
let dropChrono = false;
let dropSlotPlus = false;
// 玉追加時の落下アニメーション（上からズドーン）
let slotDropAnim = {
  active: false,
  targetIndex: 0,
  startTime: 0,
  duration: 185,
};

// クロノカード: 時間停止 60秒、発動中に使うと60秒延長
const CHRONO_DURATION_MS = 60 * 1000;
let pauseEndTime = 0; // Date.now() を超えるまで time を更新しない

// 続きから用 localStorage（HP・残り時間・レベル）
const SAVE_KEY = "barcodebusters_monster_save";
let lastSaveTime = 0;
const hasSavedGame = ref(false);

//モンスター画像を読み込み
let monsterImage = new Image();

//背景画像を読み込み
let haikeiImage = new Image();

//爆発画像を読み込み
let explosionImages = [];
for (let i = 0; i < 4; i++) {
  explosionImages.push(new Image());
  explosionImages[i].src = EXPLOSION_SRC[i];
}

//スロット画像を読み込み
let slotImages = [];
for (let i = 0; i < 11; i++) {
  slotImages.push(new Image());
  slotImages[i].src = SLOT_SRC[i];
}

//効果音を読み込み
const explosion0Sound = new Audio("/sounds/miss.mp3");
const explosion1Sound = new Audio("/sounds/punch-middle2.mp3");
const explosion2Sound = new Audio("/sounds/punch-high1.mp3");
const explosion3Sound = new Audio("/sounds/punch-high2.mp3");
const explosion4Sound = new Audio("/sounds/bomb2.mp3");
const victorySound = new Audio("/sounds/people-people-stadium-cheer1.mp3");
const timeUpSound = new Audio("/sounds/game-princess-lose1.mp3");
const itemCardSound = new Audio("/sounds/game-thief-boy-special3.mp3");
const slotPlusImpactSound = new Audio("/sounds/taiko-don.mp3");
const kaishinRateSound = new Audio("/sounds/AmountDisplay.mp3");
const rouletteSound = new Audio("/sounds/ElectronicRouletteSpinning.mp3");
rouletteSound.loop = true;

// 日本時間で今日の日付 YYYY-MM-DD
const getTodayJapan = () => {
  const now = new Date();
  const jp = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const y = jp.getFullYear();
  const m = String(jp.getMonth() + 1).padStart(2, "0");
  const d = String(jp.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// seitoID で Member を取得し、ref にセット（今日以外ならノーマルカード枚数は 0）
const fetchMemberBySeitoId = async (seitoID) => {
  memberError.value = "";
  const { data, error } = await supabase
    .from("Member")
    .select('"Name","IconPath",barcode_busters_items')
    .eq("seitoID", seitoID.trim())
    .maybeSingle();

  if (error) {
    memberError.value = error.message || "取得に失敗しました";
    return false;
  }
  if (!data) {
    memberError.value = "IDが一致する生徒が見つかりません";
    return false;
  }

  const today = getTodayJapan();
  const items = data.barcode_busters_items;
  const validDate =
    items && items.validDate ? String(items.validDate).slice(0, 10) : null;
  const isToday = validDate === today;

  currentSeitoId.value = seitoID.trim();
  memberName.value = data.Name ?? "";
  memberIconUrl.value = "";
  if (data.IconPath) {
    const path = String(data.IconPath).replace(/^\//, "");
    memberIconUrl.value = import.meta.env.BASE_URL + path;
  }
  baisuruNormal.value = isToday ? (items?.baisuru?.normal ?? 0) : 0;
  kakuriaNormal.value = isToday ? (items?.kakuria?.normal ?? 0) : 0;
  chronoNormal.value = isToday ? (items?.chrono?.normal ?? 0) : 0;
  slotPlusNormal.value = isToday ? (items?.slotPlus?.normal ?? 0) : 0;
  return true;
};

const resetMember = () => {
  hasMember.value = false;
  currentSeitoId.value = "";
  memberName.value = "";
  memberIconUrl.value = "";
  baisuruNormal.value = 0;
  kakuriaNormal.value = 0;
  chronoNormal.value = 0;
  slotPlusNormal.value = 0;
  memberError.value = "";
  information.value = "IDカードを読み込んでください";
};

// バイスル（ノーマル）をボタンで使用（残数あり＆アタックボーナス128未満＆未回答のときだけ押せる）
const useBaisuru = () => {
  if (
    !hasMember.value ||
    baisuruNormal.value <= 0 ||
    attackBonus.value >= 128 ||
    answerSubmitted.value
  )
    return;
  baisuruNormal.value--;
  attackBonus.value *= 2;
  playSound(itemCardSound);
  updateMemberCardCounts();
};

// カクリア（ノーマル）をボタンで使用（残数あり＆会心レート10未満＆未回答のときだけ押せる）
const useKakuria = () => {
  if (
    !hasMember.value ||
    kakuriaNormal.value <= 0 ||
    kaishinRate.value >= 10 ||
    answerSubmitted.value
  )
    return;
  kakuriaNormal.value--;
  kaishinRate.value += 3;
  playSound(kaishinRateSound);
  updateMemberCardCounts();
};

// クロノ（ノーマル）: いつでも使えてすぐ発動。60秒間時間停止。発動中に使うと60秒延長。
const useChrono = () => {
  if (!hasMember.value || chronoNormal.value <= 0 || answerSubmitted.value)
    return;
  const now = Date.now();
  if (startTime && now < limitTime + startTime) {
    // ゲーム開始後・時間切れ前のみ
    chronoNormal.value--;
    limitTime += CHRONO_DURATION_MS;
    if (pauseEndTime > now) {
      pauseEndTime += CHRONO_DURATION_MS;
    } else {
      pauseEndTime = now + CHRONO_DURATION_MS;
    }
    updateMemberCardCounts();
  }
};

// 攻撃玉追加カード: 次の1回の攻撃のみ玉が1つ増える（最大35まで）。問題読み込み後〜答え入力前（answerMode）の間のみ使用可
const useSlotPlus = () => {
  if (
    !hasMember.value ||
    slotPlusNormal.value <= 0 ||
    !answerMode.value ||
    answerSubmitted.value ||
    Number(mondaiLevel.value) + extraSlotsNextAttack.value >= MAX_ATTACK_SLOTS
  )
    return;
  slotPlusNormal.value--;
  extraSlotsNextAttack.value += 1;
  playSound(slotPlusImpactSound);
  const newSlotIndex =
    Number(mondaiLevel.value) + extraSlotsNextAttack.value - 1;
  slotDropAnim = {
    active: true,
    targetIndex: newSlotIndex,
    startTime: Date.now(),
    duration: 185,
  };
  updateMemberCardCounts();
};

// 生徒のカード枚数をDBに反映（barcode_busters_items に保存）
const updateMemberCardCounts = async () => {
  if (!currentSeitoId.value) return;
  const today = getTodayJapan();
  await supabase
    .from("Member")
    .update({
      barcode_busters_items: {
        validDate: today,
        baisuru: {
          normal: baisuruNormal.value,
          silver: 0,
          gold: 0,
        },
        kakuria: {
          normal: kakuriaNormal.value,
          silver: 0,
          gold: 0,
        },
        chrono: { normal: chronoNormal.value },
        slotPlus: { normal: slotPlusNormal.value },
      },
    })
    .eq("seitoID", currentSeitoId.value);
};

// ゲーム状態を localStorage に保存（playing のときだけ）
const saveGameState = () => {
  if (gamePhase.value !== "playing") return;
  const remaining = Math.max(0, limitTime + startTime - Date.now());
  const data = {
    currentLevel: monsterStore.currentLevel,
    monsterHitpoint,
    remainingTimeMs: remaining,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (_) {}
};

const loadSavedState = () => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (
      !data ||
      typeof data.currentLevel !== "number" ||
      typeof data.monsterHitpoint !== "number" ||
      typeof data.remainingTimeMs !== "number"
    )
      return null;
    return data;
  } catch (_) {
    return null;
  }
};

const clearSavedGame = () => {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (_) {}
  hasSavedGame.value = false;
};

//マウント後の処理
onMounted(() => {
  canvas.value.width = SCREEN_SIZE_W;
  canvas.value.height = SCREEN_SIZE_H;
  canvasContext = canvas.value.getContext("2d");
  varInit();
  pauseEndTime = 0;
  inputInit();
  drawMonster();
  startButton.value.hidden = false;
  hasSavedGame.value = !!loadSavedState();
  window.addEventListener("beforeunload", saveGameState);
});

onUnmounted(() => {
  window.removeEventListener("beforeunload", saveGameState);
});

// 続きから復元
const resumeGame = (saved) => {
  hasSavedGame.value = false;
  monsterStore.currentLevel = saved.currentLevel;
  const status = monsterStore.monsterStatus;
  if (!status) return;
  monsterImage.src = status[1];
  haikeiImage.src = status[4];
  monsterHitpoint = saved.monsterHitpoint;
  limitTime = saved.remainingTimeMs;
  startTime = Date.now();
  startButton.value.hidden = true;
  barcodeButton.value.disabled = false;
  varInit();
  pauseEndTime = 0;
  inputInit();
  buttonInit();
  lastSaveTime = Date.now();
  gameLoop();
  gamePhase.value = "playing";
  information.value = "↓↓↓↓↓　　　下のボタンを押してください";
};

// スタート or 続きから
const startOrResume = () => {
  const saved = loadSavedState();
  if (saved) {
    resumeGame(saved);
  } else {
    start();
  }
};

//スタートボタン（新規ゲーム）
const start = () => {
  clearSavedGame();
  monsterImage.src = monsterStore.monsterStatus[1];
  monsterHitpoint = monsterStore.monsterStatus[2];
  limitTime = monsterStore.monsterStatus[3];
  haikeiImage.src = monsterStore.monsterStatus[4];
  startTime = Date.now();
  startButton.value.hidden = true;
  barcodeButton.value.disabled = false;
  varInit();
  pauseEndTime = 0;
  inputInit();
  buttonInit();
  lastSaveTime = Date.now();
  gameLoop();
  gamePhase.value = "playing";
  information.value = "↓↓↓↓↓　　　下のボタンを押してください";
};

//ゲームループ
const gameLoop = () => {
  game = setInterval(() => {
    const now = Date.now();
    // クロノ発動中は時間を止める
    if (pauseEndTime < 0 || now > pauseEndTime) {
      //update処理
      time = limitTime + startTime - now;
      if (time < 0) {
        time = 0;
        clearInterval(game);
        setTimeout(() => {
          timeUp();
        }, 200);
      }
    }

    if (pauseEndTime > 0 && now >= pauseEndTime) {
      pauseEndTime = 0;
    }

    if (monsterHitpoint <= 0) {
      clearInterval(game);
      setTimeout(() => {
        victory();
      }, 200);
    }
    // 約1秒ごとにセーブ
    if (now - lastSaveTime >= 1000) {
      saveGameState();
      lastSaveTime = now;
    }
    //draw処理
    drawALL();
  }, 50);
};

//バーコード準備ボタン
const barcodeButtonClick = () => {
  if (answerSubmitted.value) {
    resetMember();
  }
  answerSubmitted.value = false;
  varInit();
  inputInit();
  barcodeInput.value.focus();
  buttonCaption.value = "読み込み準備ＯＫ";
  barcodeButton.value.disabled = true;
  hantei.value = "";
  information.value = hasMember.value
    ? "問題のバーコードを読み込んでください"
    : "IDカードを読み込んでください";
};

//バーコードインプット（生徒ID・問題・カード用）
const barcodeInputBlur = async () => {
  // 生徒情報未取得のときは読み込むバーコードは生徒IDとして扱う
  if (!hasMember.value) {
    const raw = (barcode.value || "").trim();
    if (raw) {
      const ok = await fetchMemberBySeitoId(raw);
      if (ok) {
        hasMember.value = true;
        memberError.value = "";
        information.value = "問題のバーコードを読み込んでください";
      } else {
        memberError.value = memberError.value || "取得に失敗しました";
      }
    }
    inputInit();
    barcodeInput.value.focus();
    return;
  }

  const initialLetter = barcode.value.slice(0, 1);
  if (initialLetter === "B") {
    answerSubmitted.value = false; // 新しい問題なのでカード使用可能に
    answerInput.value.disabled = false;
    answerInput.value.focus();
    answerMode.value = true;
    mondaiLevel.value = barcode.value.slice(1, 2);
    correctAnswer = barcode.value.slice(2) / 3;
    buttonCaption.value = "読み込み完了";
    information.value = "答えを入力してください　　　↓↓↓↓↓↓";
    barcode.value = "";
    barcodeInput.value.disabled = false;
    return;
  }
  const raw = (barcode.value || "").trim();
  if (raw) {
    const ok = await fetchMemberBySeitoId(raw);
    if (ok) {
      hasMember.value = true;
      memberError.value = "";
      information.value = "問題のバーコードを読み込んでください";
    } else {
      memberError.value = memberError.value || "取得に失敗しました";
    }
  }
  inputInit();
  barcodeInput.value.focus();
};

//答えインプット（問題の答えのみ）
const answerInputBlur = () => {
  answerSubmitted.value = true; // 正解・不正解どちらでも答え入力後はカード使用不可
  if (inputedAnswer.value == correctAnswer) {
    hantei.value = "せいか～い";
    attackButton.value.hidden = false;
    information.value = "↑↑↑↑↑↑　　　攻撃ボタンを押してください";
  } else {
    hantei.value = "はずれ";
    buttonInit();
    information.value = "↓↓↓↓↓　　　下のボタンを押してください";
  }
  answerMode.value = false;
  answerInput.value.disabled = true;
  inputedAnswer.value = "";
  setTimeout(() => {
    attackButton.value.focus();
  }, 10);
};

//攻撃ボタン
const attack = () => {
  const effectiveMondaiLevel = Math.min(
    Number(mondaiLevel.value) + extraSlotsNextAttack.value,
    MAX_ATTACK_SLOTS,
  );
  effectiveSlotsUsed = effectiveMondaiLevel;

  //攻撃力の計算（スロット出目を35個分決定）
  if (Math.random() * 10 < kaishinRate.value) {
    attackSlots.fill(9);
  } else {
    for (let i = 0; i < MAX_ATTACK_SLOTS; i++) {
      attackSlots[i] = Math.floor(Math.random() * 9);
    }
  }

  for (let i = 0; i < effectiveMondaiLevel; i++) {
    attackPower += attackSlots[i];
  }

  attackPower *= attackBonus.value;
  extraSlotsNextAttack.value = 0;

  //攻撃処理
  attacked = true;
  monsterHitpoint -= attackPower;

  //効果音を鳴らす
  rouletteSound.pause();
  if (attackPower > 1000) {
    explosion4Sound.play();
    explosion = 20;
  } else if (attackPower > 500) {
    explosion3Sound.play();
    explosion = 16;
  } else if (attackPower > 200) {
    explosion2Sound.play();
    explosion = 12;
  } else if (attackPower > 0) {
    explosion1Sound.play();
    explosion = 8;
  } else {
    explosion0Sound.play();
  }

  //バイスル抽選（ノーマルのみ）
  if (Math.random() < 0.5) dropItem = true;

  //カクリア抽選（ノーマルのみ）
  if (Math.random() < 0.4) dropKaishin = true;

  //クロノ抽選（ノーマルのみ）
  if (Math.random() < 0.4) dropChrono = true;

  // 攻撃玉追加カード抽選（20％）
  if (Math.random() < 0.6) dropSlotPlus = true;

  // 抽選に当たったときは生徒情報のカード数も増やす（表示＋DB）
  if (hasMember.value) {
    if (dropItem) {
      baisuruNormal.value++;
    }
    if (dropKaishin) {
      kakuriaNormal.value++;
    }
    if (dropChrono) {
      chronoNormal.value++;
    }
    if (dropSlotPlus) {
      slotPlusNormal.value++;
    }
    if (dropItem || dropKaishin || dropChrono || dropSlotPlus) {
      updateMemberCardCounts();
    }
  }

  buttonInit();
  hantei.value = "";
  information.value = "↓↓↓↓↓　　　下のボタンを押してください";
  saveGameState();
};

//変数の初期化
const varInit = () => {
  attackSlots = Array(MAX_ATTACK_SLOTS).fill(0);
  attackPower = 0;
  attackBonus.value = 1;
  kaishinRate.value = 1;
  attacked = false;
  mondaiLevel.value = 0;
  extraSlotsNextAttack.value = 0;
  effectiveSlotsUsed = 0;
  explosion = 0;
  dropItem = false;
  dropKaishin = false;
  dropChrono = false;
  dropSlotPlus = false;
  slotDropAnim = { active: false, targetIndex: 0, startTime: 0, duration: 185 };
  // pauseEndTime はここでリセットしない（クロノ発動中にバーコードボタンで「次の読み込み準備」を押してもクロノを維持する）
};

//インプット要素の初期化
const inputInit = () => {
  barcodeInput.value.disabled = false;
  barcode.value = "";
  answerInput.value.disabled = true;
  inputedAnswer.value = "";
};

//ボタン要素の初期化
const buttonInit = () => {
  //攻撃ボタン
  attackButton.value.hidden = true;
  //バーコード準備ボタン
  barcodeButton.value.disabled = false;
  buttonCaption.value = "このボタンを押せ";
  // barcodeButton.value.focus();
};

//各種情報表示処理************************************
const drawALL = () => {
  drawMonster();
  drawTime();
  drawHitpoint();
  drawAttackSlot();
  drawAttackPower();
  drawAttackBonus();
  drawKaishinRate();
  drawExplosion();
  drawKaishin();
  drawDropItem();
  drawDropKaishin();
  drawDropChrono();
  drawDropSlotPlus();
};

const drawMonster = () => {
  // 背景画像にhaikeiimageを使用
  if (haikeiImage.complete && haikeiImage.naturalWidth > 0) {
    canvasContext.drawImage(haikeiImage, 0, 0, SCREEN_SIZE_W, SCREEN_SIZE_H);
  } else {
    canvasContext.fillStyle = SCREEN_BK_COLOR;
    canvasContext.fillRect(0, 0, SCREEN_SIZE_W, SCREEN_SIZE_H);
  }
  // 背景描画の直後
  canvasContext.fillStyle = "rgba(0, 0, 0, 0.5)";
  canvasContext.fillRect(0, 0, SCREEN_SIZE_W, SCREEN_SIZE_H);
  // モンスター描画
  if (monsterImage.complete && monsterImage.naturalWidth > 0) {
    canvasContext.drawImage(monsterImage, 150, 0, 500, 500);
  }
};

const drawTime = () => {
  // タイマー（TIME）は常に表示（クロノ発動中は time が止まっているのでその値のまま）
  const timeStr = "TIME : " + Math.floor(time / 1000);
  canvasContext.font = "50px Impact";
  canvasContext.fillStyle = "white";
  canvasContext.fillText(timeStr, 570, 50);

  // クロノ発動中は「あと X 秒」を追加表示
  const now = Date.now();
  if (pauseEndTime > 0 && now < pauseEndTime) {
    const remainSec = Math.ceil((pauseEndTime - now) / 1000);
    canvasContext.font = "60px Impact";
    canvasContext.fillStyle = "darkviolet";
    canvasContext.fillRect(120, 140, 560, 110);
    canvasContext.fillStyle = "white";
    canvasContext.fillText("時間停止 あと " + remainSec + " 秒", 140, 220);
  }
};

const drawHitpoint = () => {
  const hpStr = "HP : " + monsterHitpoint;
  canvasContext.font = "50px Impact";
  canvasContext.fillStyle = "white";
  canvasContext.fillText(hpStr, 10, 50);
};

const drawAttackSlot = () => {
  const displayCount = attacked
    ? effectiveSlotsUsed
    : Math.min(
        Number(mondaiLevel.value) + extraSlotsNextAttack.value,
        MAX_ATTACK_SLOTS,
      );
  const slotSize = 100;
  const cols = 7;
  // 落下アニメ中は追加された玉をメインループでは描画しない（アニメでだけ描画）
  const skipIndex = slotDropAnim.active ? slotDropAnim.targetIndex : -1;

  // 下の段から描画（i=0〜6が最下段、8個目以降はその上に積み上げ）
  for (let i = 0; i < MAX_ATTACK_SLOTS; i++) {
    if (i === skipIndex) continue;
    const col = i % cols;
    const rowIndex = Math.floor(i / cols);
    const x = 100 + col * slotSize;
    const y = SCREEN_SIZE_H - slotSize * (rowIndex + 1);
    if (i < displayCount) {
      if (attacked) {
        canvasContext.drawImage(
          slotImages[attackSlots[i]],
          x,
          y,
          slotSize,
          slotSize,
        );
      } else if (!attackButton.value.hidden) {
        const r = Math.floor(Math.random() * 10);
        canvasContext.drawImage(slotImages[r], x, y, slotSize, slotSize);
        rouletteSound.play();
      } else {
        canvasContext.drawImage(slotImages[10], x, y, slotSize, slotSize);
      }
    }
    // 未使用枠（i >= displayCount）は描画しない
  }

  // 玉追加時の落下アニメーション（上からズドーン・重厚な着地）
  if (slotDropAnim.active) {
    const elapsed = Date.now() - slotDropAnim.startTime;
    const progress = Math.min(1, elapsed / slotDropAnim.duration);
    // easeOutBack: 最後に一気に加速して着地し、わずかにオーバーシュートして戻る（ズドン）
    const c1 = 0.6;
    const c3 = c1 + 1;
    const easeOutBack =
      progress < 1
        ? 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2)
        : 1;
    const ti = slotDropAnim.targetIndex;
    const col = ti % cols;
    const rowIndex = Math.floor(ti / cols);
    const animX = 100 + col * slotSize;
    const endY = SCREEN_SIZE_H - slotSize * (rowIndex + 1);
    const startY = -slotSize * 2;
    const currentY = startY + (endY - startY) * easeOutBack;
    canvasContext.drawImage(
      slotImages[10],
      animX,
      currentY,
      slotSize,
      slotSize,
    );
    if (progress >= 1) slotDropAnim.active = false;
  }
};

const drawAttackPower = () => {
  if (attackPower) {
    canvasContext.font = "50px Impact";
    canvasContext.fillStyle = "yellow";
    canvasContext.fillText("攻撃力", 30, 200);
    canvasContext.fillText(attackPower, 80, 250);
  }
};

const drawAttackBonus = () => {
  if (attackBonus.value > 1) {
    canvasContext.font = "50px Impact";
    canvasContext.fillStyle = "blue";
    canvasContext.fillText("×" + attackBonus.value, 10, 475);
  }
};

const drawKaishinRate = () => {
  if (kaishinRate.value > 1) {
    canvasContext.font = "28px Impact";
    canvasContext.fillStyle = "deeppink";
    canvasContext.fillText("会心の一撃確率", 600, 350);
    canvasContext.font = "50px Impact";
    canvasContext.fillText(kaishinRate.value * 10 + "％", 650, 400);
  }
};

const drawExplosion = () => {
  if (explosion) {
    const imageNum = explosion % 2;
    canvasContext.drawImage(explosionImages[imageNum], 250, 70, 300, 300);
    explosion--;
  }
};

const drawKaishin = () => {
  if (attackSlots[0] == 9) {
    canvasContext.font = "100px Impact";
    canvasContext.fillStyle = "fuchsia";
    canvasContext.fillText("会心の一撃", 170, 150);
  }
};

const DROP_DISPLAY_ALPHA = 0.7;

const drawDropItem = () => {
  if (dropItem) {
    canvasContext.globalAlpha = DROP_DISPLAY_ALPHA;
    canvasContext.font = "30px Impact";
    canvasContext.fillStyle = "yellow";
    canvasContext.fillRect(10, 270, 250, 40);
    canvasContext.fillStyle = "red";
    canvasContext.fillText("２倍カード", 20, 300);
    canvasContext.globalAlpha = 1;
  }
};

const drawDropKaishin = () => {
  if (dropKaishin) {
    canvasContext.globalAlpha = DROP_DISPLAY_ALPHA;
    canvasContext.font = "30px Impact";
    canvasContext.fillStyle = "violet";
    canvasContext.fillRect(10, 320, 250, 40);
    canvasContext.fillStyle = "mediumblue";
    canvasContext.fillText("確率アップカード", 20, 350);
    canvasContext.globalAlpha = 1;
  }
};

const drawDropChrono = () => {
  if (dropChrono) {
    canvasContext.globalAlpha = DROP_DISPLAY_ALPHA;
    canvasContext.font = "30px Impact";
    canvasContext.fillStyle = "darkviolet";
    canvasContext.fillRect(10, 370, 250, 40);
    canvasContext.fillStyle = "white";
    canvasContext.fillText("時間停止カード", 20, 400);
    canvasContext.globalAlpha = 1;
  }
};

const drawDropSlotPlus = () => {
  if (dropSlotPlus) {
    canvasContext.globalAlpha = DROP_DISPLAY_ALPHA;
    canvasContext.font = "30px Impact";
    canvasContext.fillStyle = "teal";
    canvasContext.fillRect(10, 420, 250, 40);
    canvasContext.fillStyle = "white";
    canvasContext.fillText("攻撃玉追加カード", 20, 450);
    canvasContext.globalAlpha = 1;
  }
};
//各種情報表示処理************************************

//時間切れ処理
const timeUp = () => {
  clearSavedGame();
  gamePhase.value = "timeUp";
  pauseEndTime = 0;
  rouletteSound.pause();
  timeUpSound.play();
  canvasContext.font = "200px Impact";
  canvasContext.fillStyle = "aqua";
  canvasContext.fillText("TIME UP", 100, 200);
  barcodeButton.value.disabled = true;
  barcodeInput.value.disabled = true;
  answerInput.value.disabled = true;
  attackButton.value.hidden = true;
  startButton.value.hidden = false;
};

//勝利処理
const victory = () => {
  clearSavedGame();
  gamePhase.value = "victory";
  pauseEndTime = 0;
  rouletteSound.pause();
  victorySound.play();
  canvasContext.font = "200px Impact";
  canvasContext.fillStyle = "aqua";
  canvasContext.fillText("勝　利", 150, 200);
  barcodeButton.value.disabled = true;
  barcodeInput.value.disabled = true;
  answerInput.value.disabled = true;
  attackButton.value.hidden = true;

  let nextLevel = monsterStore.currentLevel + 1;
  if (nextLevel > 7) nextLevel = 1;
  monsterStore.currentLevel = nextLevel;
  startCaption.value = "レベル" + nextLevel + "へ";
  startButton.value.hidden = false;
};

//中断してトップページに戻る
const stop = () => {
  clearSavedGame();
  gamePhase.value = "idle";
  pauseEndTime = 0;
  rouletteSound.pause();
  clearInterval(game);
  router.push("/menu");
};

const playSound = (sound) => {
  sound.currentTime = 0;
  sound.play();
};
</script>

<template>
  <div class="monster-layout">
    <aside class="member-panel">
      <div class="member-name">{{ hasMember ? memberName : "ー" }}</div>
      <img
        v-if="hasMember && memberIconUrl"
        :src="memberIconUrl"
        alt="アイコン"
        class="member-icon"
      />
      <div v-else class="member-icon-placeholder">ー</div>
      <div class="panel-section-label">ノーマルカード欄</div>
      <div class="member-row">
        <span>２倍カード</span>
        <span>{{ hasMember ? baisuruNormal : "ー" }}</span>
      </div>
      <button
        type="button"
        class="btn btn-sm mt-1"
        :class="
          hasMember &&
          baisuruNormal > 0 &&
          attackBonus < 128 &&
          !answerSubmitted &&
          !answerMode
            ? 'btn-warning'
            : 'btn-outline-secondary'
        "
        :disabled="
          !hasMember ||
          baisuruNormal <= 0 ||
          attackBonus >= 128 ||
          answerSubmitted ||
          answerMode
        "
        @click="useBaisuru"
      >
        攻撃力２倍
      </button>
      <div class="member-row">
        <span>確率アップカード</span>
        <span>{{ hasMember ? kakuriaNormal : "ー" }}</span>
      </div>
      <button
        type="button"
        class="btn btn-sm mt-1"
        :class="
          hasMember &&
          kakuriaNormal > 0 &&
          kaishinRate < 10 &&
          !answerSubmitted &&
          !answerMode
            ? 'btn-info'
            : 'btn-outline-secondary'
        "
        :disabled="
          !hasMember ||
          kakuriaNormal <= 0 ||
          kaishinRate >= 10 ||
          answerSubmitted ||
          answerMode
        "
        @click="useKakuria"
      >
        会心の一撃確率アップ
      </button>
      <div class="member-row">
        <span>時間停止カード</span>
        <span>{{ hasMember ? chronoNormal : "ー" }}</span>
      </div>
      <button
        type="button"
        class="btn btn-sm mt-1"
        :class="
          hasMember && chronoNormal > 0 && !answerSubmitted && !answerMode
            ? 'btn-secondary'
            : 'btn-outline-secondary'
        "
        :disabled="
          !hasMember ||
          chronoNormal <= 0 ||
          !isGameActive ||
          isTimeUp ||
          answerMode ||
          answerSubmitted
        "
        @click="useChrono"
      >
        時を止める
      </button>
      <div class="member-row">
        <span>攻撃玉追加カード</span>
        <span>{{ hasMember ? slotPlusNormal : "ー" }}</span>
      </div>
      <button
        type="button"
        class="btn btn-sm mt-1"
        :class="
          hasMember &&
          slotPlusNormal > 0 &&
          answerMode &&
          !answerSubmitted &&
          Number(mondaiLevel) + extraSlotsNextAttack < MAX_ATTACK_SLOTS
            ? 'btn-success'
            : 'btn-outline-secondary'
        "
        :disabled="
          !hasMember ||
          slotPlusNormal <= 0 ||
          !answerMode ||
          answerSubmitted ||
          Number(mondaiLevel) + extraSlotsNextAttack >= MAX_ATTACK_SLOTS
        "
        @mousedown.prevent
        @click="useSlotPlus"
      >
        玉を1つ追加
      </button>
      <div>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm mt-2"
          @click="resetMember"
        >
          別の生徒
        </button>
      </div>
      <p v-if="memberError" class="text-danger small mt-1">{{ memberError }}</p>
    </aside>
    <div class="wrap" style="position: relative">
      <canvas ref="canvas"></canvas>
      <button
        ref="startButton"
        class="startButton btn btn-light"
        @click="startOrResume"
        v-text="hasSavedGame ? '続きから' : startCaption"
        hidden
      ></button>
      <div class="info" v-text="information"></div>
      <div class="row">
        <div class="col-4">
          <button
            ref="barcodeButton"
            class="barcodeButton btn btn-primary"
            style="width: 100%"
            @click="barcodeButtonClick()"
            v-text="buttonCaption"
            disabled
          ></button>
        </div>
        <div class="col-8">
          <input
            ref="answerInput"
            class="answerInput form-control"
            placeholder="答えを入力（Enterで送信）"
            @keydown.enter.prevent="answerInputBlur()"
            v-model="inputedAnswer"
          />
        </div>
      </div>
      <div class="hantei" v-text="hantei"></div>
      <button
        ref="attackButton"
        class="attackButton btn"
        @click="attack()"
        hidden
      >
        攻撃⇒
      </button>
      <input
        ref="barcodeInput"
        class="barcodeInput"
        tabindex="-1"
        @blur="barcodeInputBlur()"
        @keydown.enter="barcodeInput.blur()"
        v-model="barcode"
        autocomplete="off"
        type="password"
      />
      <div class="mekakushi" style=""></div>

      <button class="stopButton btn btn-outline-danger" @click="stop()">
        中断してメニューに戻る
      </button>
    </div>
  </div>
</template>

<style scoped>
.monster-layout {
  display: flex;
  gap: 1rem;
  max-width: 1100px;
  margin: 0 auto;
}
.member-panel {
  width: 200px;
  flex-shrink: 0;
  padding: 1rem;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background: #f8f9fa;
}
.member-name {
  font-weight: bold;
  margin-bottom: 0.5rem;
  word-break: break-all;
}
.member-icon {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  display: block;
  margin-bottom: 0.5rem;
}
.member-icon-placeholder {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e9ecef;
  border-radius: 8px;
  font-size: 12px;
  margin-bottom: 0.5rem;
}
.panel-section-label {
  font-size: 12px;
  font-weight: bold;
  color: #495057;
  margin-bottom: 0.5rem;
  margin-top: 0.5rem;
}
.member-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
  font-size: 14px;
}
.id-prompt {
  margin-bottom: 0.5rem;
}
.startButton {
  position: absolute;
  top: 250px;
  left: 200px;
  width: 400px;
  height: 200px;
  font-size: 50px;
  opacity: 90%;
}
.info {
  font-size: 30px;
  color: blue;
  padding-left: 50px;
}
.barcodeInput {
  position: absolute;
  top: 615px;
  left: 750px;
  width: 0px;
}
.mekakushi {
  position: absolute;
  top: 610px;
  left: 700px;
  width: 100px;
  height: 40px;
  display: block;
  background-color: white;
}
.barcodeButton {
  font-size: 25px;
}
.answerInput {
  text-align: center;
  font-size: 25px;
  color: crimson;
}
.attackButton {
  position: absolute;
  top: 130px;
  left: 20px;
  width: 180px;
  height: 200px;
  color: yellow;
  background-color: red;
  font-size: 50px;
}
.hantei {
  text-align: center;
  color: green;
  font-size: 50px;
}
.stopButton {
  position: absolute;
  top: 650px;
  left: 600px;
  width: 200px;
}
</style>
