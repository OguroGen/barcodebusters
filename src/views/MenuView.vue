<script setup>
    import { useRouter } from 'vue-router'
    import { MonsterStore } from '@/stores/monster'
    const router=useRouter();
    const monsterStore=MonsterStore();

    const level1=()=>{
        monsterStore.currentLevel=1;
        router.push('/monster')
    }

    const level2=()=>{
        monsterStore.currentLevel=2;
        router.push('/monster')
    }

    const level3=()=>{
        monsterStore.currentLevel=3;
        router.push('/monster')
    }

    const level4=()=>{
        monsterStore.currentLevel=4;
        router.push('/monster')
    }
    
    const level5=()=>{
        monsterStore.currentLevel=5;
        router.push('/monster')
    }

</script>

<template>
    <div>
        <button class="mt-3 btn btn-outline-primary" @click="level1">レベル１</button>
    </div>
    <div>
        <button class="mt-3 btn btn-outline-primary" @click="level2">レベル２</button>
    </div>
     <div>   
        <button class="mt-3 btn btn-outline-primary" @click="level3">レベル３</button>
    </div>
    <div>
        <button class="mt-3 btn btn-outline-primary" @click="level4">レベル４</button>
    </div>
    <div> 
        <button class="mt-3 btn btn-outline-primary" @click="level5">レベル５</button>
    </div>
</template>

<style scoped>

</style>