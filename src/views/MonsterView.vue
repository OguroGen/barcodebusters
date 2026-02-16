<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { MonsterStore } from "@/stores/monster";
import { supabase } from "@/supabase";

const router = useRouter();
const monsterStore = MonsterStore();

//定数
const SCREEN_SIZE_W = 800;
const SCREEN_SIZE_H = 500;
const SCREEN_BK_COLOR = "#66AAFF";
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
const itemCardCount = ref(0);
const kaishinCardCount = ref(0);
const memberError = ref("");
const answerMode = ref(false);
const afterAttackOrMiss = ref(false);

//変数、配列
let game;
let startTime;
let time;
let limitTime;
let con;
let correctAnswer = 0;
let mondaiLevel = 0;
let attackSlots = [0, 0, 0, 0, 0, 0, 0];
let attacked = false;
const kaishinRate = ref(1);
let monsterHitpoint;
let attackPower;
const attackBonus = ref(1);
let explosion;
let dropItem = true;
let dropKaishin = true;

//モンスター画像を読み込み
let monsterImage = new Image();

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

// seitoID で Member を取得し、ref にセット（今日以外ならカード枚数は 0）
const fetchMemberBySeitoId = async (seitoID) => {
  memberError.value = "";
  const { data, error } = await supabase
    .from("Member")
    .select('"Name","IconPath",item_card_count,kaishin_card_count,item_cards_valid_date')
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
  const validDate = data.item_cards_valid_date
    ? String(data.item_cards_valid_date).slice(0, 10)
    : null;
  const isToday = validDate === today;

  currentSeitoId.value = seitoID.trim();
  memberName.value = data.Name ?? "";
  memberIconUrl.value = "";
  if (data.IconPath) {
    const path = String(data.IconPath).replace(/^\//, "");
    memberIconUrl.value = import.meta.env.BASE_URL + path;
  }
  itemCardCount.value = isToday ? (data.item_card_count ?? 0) : 0;
  kaishinCardCount.value = isToday ? (data.kaishin_card_count ?? 0) : 0;
  return true;
};

const resetMember = () => {
  hasMember.value = false;
  currentSeitoId.value = "";
  memberName.value = "";
  memberIconUrl.value = "";
  itemCardCount.value = 0;
  kaishinCardCount.value = 0;
  memberError.value = "";
  information.value = "IDカードを読み込んでください";
};

// アイテムカードをボタンで使用（残数あり＆アタックボーナス64未満のときだけ押せる）
const useItemCard = () => {
  if (!hasMember.value || itemCardCount.value <= 0 || attackBonus.value >= 64) return;
  itemCardCount.value--;
  attackBonus.value *= 2;
  playSound(itemCardSound);
  updateMemberCardCounts();
};

// 会心の一撃確率アップカードをボタンで使用（残数あり＆会心レート10未満のときだけ押せる）
const useKaishinCard = () => {
  if (!hasMember.value || kaishinCardCount.value <= 0 || kaishinRate.value >= 10) return;
  kaishinCardCount.value--;
  kaishinRate.value += 3;
  playSound(kaishinRateSound);
  updateMemberCardCounts();
};

// 生徒のカード枚数をDBに反映（今日の日付で）
const updateMemberCardCounts = async () => {
  if (!currentSeitoId.value) return;
  const today = getTodayJapan();
  await supabase
    .from("Member")
    .update({
      item_card_count: itemCardCount.value,
      kaishin_card_count: kaishinCardCount.value,
      item_cards_valid_date: today,
    })
    .eq("seitoID", currentSeitoId.value);
};

//マウント後の処理
onMounted(() => {
  canvas.value.width = SCREEN_SIZE_W;
  canvas.value.height = SCREEN_SIZE_H;
  con = canvas.value.getContext("2d");
  varInit();
  inputInit();
  drawMonster();
  startButton.value.hidden = false;
});

//スタートボタン
const start = () => {
  monsterImage.src = monsterStore.monsterStatus[1];
  monsterHitpoint = monsterStore.monsterStatus[2];
  limitTime = monsterStore.monsterStatus[3];
  startTime = Date.now();
  startButton.value.hidden = true;
  barcodeButton.value.disabled = false;
  varInit();
  inputInit();
  buttonInit();
  gameLoop();
  information.value = "↓↓↓↓↓　　　下のボタンを押してください";
};

//ゲームループ
const gameLoop = () => {
  game = setInterval(() => {
    let t = 0;
    //update処理
    time = limitTime + startTime - Date.now();
    if (time < 0) {
      time = 0;
      clearInterval(game);
      setTimeout(() => {
        timeUp();
      }, 200);
    }
    if (monsterHitpoint <= 0) {
      clearInterval(game);
      setTimeout(() => {
        victory();
      }, 200);
    }
    //draw処理
    drawALL();
  }, 50);
};

//バーコード準備ボタン
const barcodeButtonClick = () => {
  if (afterAttackOrMiss.value) {
    resetMember();
    afterAttackOrMiss.value = false;
  }
  varInit();
  inputInit();
  barcodeInput.value.focus();
  buttonCaption.value = "読み込み準備ＯＫ";
  barcodeButton.value.disabled = true;
  hantei.value = "";
  information.value = hasMember.value ? "バーコードを読み込んでください" : "IDカードを読み込んでください";
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
        information.value = "バーコードを読み込んでください";
      } else {
        memberError.value = memberError.value || "取得に失敗しました";
      }
    }
    inputInit();
    barcodeInput.value.focus();
    return;
  }

  const initialLetter = barcode.value.slice(0, 1);
  if (initialLetter === "S") {
    answerInput.value.disabled = false;
    answerInput.value.focus();
    answerMode.value = true;
    mondaiLevel = barcode.value.slice(1, 2);
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
      information.value = "バーコードを読み込んでください";
    } else {
      memberError.value = memberError.value || "取得に失敗しました";
    }
  }
  inputInit();
  barcodeInput.value.focus();
};

//答えインプット（問題の答えのみ）
const answerInputBlur = () => {
  if (inputedAnswer.value == correctAnswer) {
    hantei.value = "せいか～い";
    attackButton.value.hidden = false;
    information.value = "↑↑↑↑↑↑　　　攻撃ボタンを押してください";
  } else {
    hantei.value = "はずれ";
    buttonInit();
    information.value = "↓↓↓↓↓　　　下のボタンを押してください";
    afterAttackOrMiss.value = true;
  }
  answerMode.value = false;
  answerInput.value.disabled = true;
  inputedAnswer.value = "";
};

//攻撃ボタン
const attack = () => {
  //攻撃力の計算
  if (Math.random() * 10 < kaishinRate.value) {
    attackSlots.fill(9);
  } else {
    attackSlots[0] = Math.floor(Math.random() * 5);
    attackSlots[1] = Math.floor(Math.random() * 5) + 1;
    attackSlots[2] = Math.floor(Math.random() * 5) + 3;
    attackSlots[3] = Math.floor(Math.random() * 5) + 5;
    attackSlots[4] = Math.floor(Math.random() * 4) + 6;
    attackSlots[5] = Math.floor(Math.random() * 3) + 7;
    attackSlots[6] = Math.floor(Math.random() * 2) + 8;
  }

  for (let i = 0; i < mondaiLevel; i++) {
    attackPower += attackSlots[i];
  }

  attackPower *= attackBonus.value;

  //攻撃処理
  attacked = true;
  monsterHitpoint -= attackPower;

  //効果音を鳴らす
  rouletteSound.pause();
  if (attackPower > 100) {
    explosion4Sound.play();
    explosion = 20;
  } else if (attackPower > 50) {
    explosion3Sound.play();
    explosion = 16;
  } else if (attackPower > 20) {
    explosion2Sound.play();
    explosion = 12;
  } else if (attackPower > 0) {
    explosion1Sound.play();
    explosion = 8;
  } else {
    explosion0Sound.play();
  }

  //アイテム抽選
  if (Math.random() * 7 < mondaiLevel) dropItem = true;

  //会心の一撃確率アップカード抽選
  if (Math.random() * 8 < mondaiLevel) dropKaishin = true;

  // 抽選に当たったときは生徒情報のカード数も増やす（表示＋DB）
  if (hasMember.value) {
    if (dropItem) {
      itemCardCount.value++;
    }
    if (dropKaishin) {
      kaishinCardCount.value++;
    }
    if (dropItem || dropKaishin) {
      updateMemberCardCounts();
    }
  }

  buttonInit();
  hantei.value = "";
  information.value = "↓↓↓↓↓　　　下のボタンを押してください";
  afterAttackOrMiss.value = true;
};

//変数の初期化
const varInit = () => {
  attackSlots = [0, 0, 0, 0, 0, 0, 0];
  attackPower = 0;
  attackBonus.value = 1;
  kaishinRate.value = 1;
  attacked = false;
  mondaiLevel = 0;
  explosion = 0;
  dropItem = false;
  dropKaishin = false;
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
};

const drawMonster = () => {
  con.fillStyle = SCREEN_BK_COLOR;
  con.fillRect(0, 0, SCREEN_SIZE_W, SCREEN_SIZE_H);
  if (monsterImage.complete && monsterImage.naturalWidth > 0) {
    con.drawImage(monsterImage, 150, 0, 500, 500);
  }
};

const drawTime = () => {
  const timeStr = "TIME : " + Math.floor(time / 1000);
  con.font = "50px Impact";
  con.fillStyle = "white";
  con.fillText(timeStr, 570, 50);
};

const drawHitpoint = () => {
  const hpStr = "HP : " + monsterHitpoint;
  con.font = "50px Impact";
  con.fillStyle = "white";
  con.fillText(hpStr, 10, 50);
};

const drawAttackSlot = () => {
  for (let i = 0; i < mondaiLevel; i++) {
    if (attacked) {
      con.drawImage(slotImages[attackSlots[i]], 100 + 100 * i, 400, 100, 100);
    } else if (!attackButton.value.hidden) {
      const r = Math.floor(Math.random() * 10);
      con.drawImage(slotImages[r], 100 + 100 * i, 400, 100, 100);
      rouletteSound.play();
    } else {
      con.drawImage(slotImages[10], 100 + 100 * i, 400, 100, 100);
    }
  }
};

const drawAttackPower = () => {
  if (attackPower) {
    con.font = "50px Impact";
    con.fillStyle = "yellow";
    con.fillText("攻撃力", 30, 200);
    con.fillText(attackPower, 80, 250);
  }
};

const drawAttackBonus = () => {
  if (attackBonus.value > 1) {
    con.font = "50px Impact";
    con.fillStyle = "blue";
    con.fillText("×" + attackBonus.value, 10, 475);
  }
};

const drawKaishinRate = () => {
  if (kaishinRate.value > 1) {
    con.font = "28px Impact";
    con.fillStyle = "deeppink";
    con.fillText("会心の一撃確率", 600, 350);
    con.font = "50px Impact";
    con.fillText(kaishinRate.value * 10 + "％", 650, 400);
  }
};

const drawExplosion = () => {
  if (explosion) {
    const imageNum = explosion % 2;
    con.drawImage(explosionImages[imageNum], 250, 70, 300, 300);
    explosion--;
  }
};

const drawKaishin = () => {
  if (attackSlots[0] == 9) {
    con.font = "100px Impact";
    con.fillStyle = "fuchsia";
    con.fillText("会心の一撃", 170, 150);
  }
};

const drawDropItem = () => {
  if (dropItem) {
    con.font = "30px Impact";
    con.fillStyle = "yellow";
    con.fillRect(10, 270, 230, 40);
    con.fillStyle = "red";
    con.fillText("アイテムＧＥＴ", 20, 300);
  }
};

const drawDropKaishin = () => {
  if (dropKaishin) {
    con.font = "30px Impact";
    con.fillStyle = "violet";
    con.fillRect(10, 320, 230, 70);
    con.fillStyle = "mediumblue";
    con.fillText("会心の一撃確率", 20, 350);
    con.fillText("アップＧＥＴ", 20, 380);
  }
};
//各種情報表示処理************************************

//時間切れ処理
const timeUp = () => {
  rouletteSound.pause();
  timeUpSound.play();
  con.font = "200px Impact";
  con.fillStyle = "aqua";
  con.fillText("TIME UP", 100, 200);
  barcodeButton.value.disabled = true;
  barcodeInput.value.disabled = true;
  answerInput.value.disabled = true;
  attackButton.value.hidden = true;
  startButton.value.hidden = false;
};

//勝利処理
const victory = () => {
  rouletteSound.pause();
  victorySound.play();
  con.font = "200px Impact";
  con.fillStyle = "aqua";
  con.fillText("勝　利", 150, 200);
  barcodeButton.value.disabled = true;
  barcodeInput.value.disabled = true;
  answerInput.value.disabled = true;
  attackButton.value.hidden = true;

  let nextLevel = monsterStore.currentLevel + 1;
  if (nextLevel > 5) nextLevel = 1;
  monsterStore.currentLevel = nextLevel;
  startCaption.value = "レベル" + nextLevel + "へ";
  startButton.value.hidden = false;
};

//中断してトップページに戻る
const stop = () => {
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
      <div class="member-row">
        <span>アイテムカード</span>
        <span>{{ hasMember ? itemCardCount : "ー" }}</span>
      </div>
      <button
        type="button"
        class="btn btn-sm mt-1"
        :class="hasMember && itemCardCount > 0 && attackBonus < 64 ? 'btn-warning' : 'btn-outline-secondary'"
        :disabled="!hasMember || itemCardCount <= 0 || attackBonus >= 64"
        @click="useItemCard"
      >
        アイテムカードを使う
      </button>
      <div class="member-row">
        <span>会心の一撃確率アップ</span>
        <span>{{ hasMember ? kaishinCardCount : "ー" }}</span>
      </div>
      <button
        type="button"
        class="btn btn-sm mt-1"
        :class="hasMember && kaishinCardCount > 0 && kaishinRate < 10 ? 'btn-info' : 'btn-outline-secondary'"
        :disabled="!hasMember || kaishinCardCount <= 0 || kaishinRate >= 10"
        @click="useKaishinCard"
      >
        会心アップを使う
      </button>
      <button type="button" class="btn btn-outline-secondary btn-sm mt-2" @click="resetMember">
        別の生徒
      </button>
      <p v-if="memberError" class="text-danger small mt-1">{{ memberError }}</p>
    </aside>
    <div class="wrap" style="position: relative">
      <canvas ref="canvas"></canvas>
      <button
        ref="startButton"
        class="startButton btn btn-light"
        @click="start"
        v-text="startCaption"
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
            placeholder="答えを入力"
            @blur="answerInputBlur()"
            @keydown.enter="answerInput.blur()"
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
  width: 80px;
  height: 80px;
  object-fit: contain;
  display: block;
  margin-bottom: 0.5rem;
}
.member-icon-placeholder {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e9ecef;
  border-radius: 8px;
  font-size: 12px;
  margin-bottom: 0.5rem;
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
  top: 610px;
  left: 750px;
  width: 0px;
}
.mekakushi {
  position: absolute;
  top: 610px;
  left: 700px;
  width: 100px;
  height: 50px;
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
