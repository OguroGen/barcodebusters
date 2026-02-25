import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const MonsterStore = defineStore('monster', () => {
  const currentLevel=ref(1);
  const monsters = ref([]);

  monsters.value=[
    [1,'/images/p276.png',100,900000,'/images/haikei1.png'],
    [2,'/images/p223.png',300,900000,'/images/haikei2.png'],
    [3,'/images/p508.png',500,900000,'/images/haikei3.png'],
    [4,'/images/p112.png',1000,900000,'/images/haikei4.png'],
    [5,'/images/p124.png',5000,1200000,'/images/haikei5.png'],
    [6,'/images/onepiece20_santaisyou.png',10000,1200000,'/images/haikei6.png'],
    [7,'/images/onepiece18_linlin_kaido.png',50000,1200000,'/images/haikei7.png']
  ]

  const monsterStatus = computed(() => monsters.value.find(monster => monster[0] === currentLevel.value));
 
  return { currentLevel, monsters, monsterStatus }
})
