<script setup>
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <div class="app-wrap">
    <h1>バーコードバスターズ</h1>
    <RouterView />
  </div>
</template>

<style scoped>
.app-wrap {
  margin: 0 auto;
  max-width: 1200px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}
h1 {
  text-align: center;
  color: cornflowerblue;
}
</style>
