<script setup>
    import { useRouter } from 'vue-router'
    const router=useRouter()

    const start=()=>{
        document.body.requestFullscreen()
        router.push('/menu')       
    }
</script>

<template>
   <button class="btn btn-primary btn-lg p-5" @click="start()">スタート</button>
</template>

<style scoped>
button{
    display:block;
    margin:100px auto;
}
</style>
