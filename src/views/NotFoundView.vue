<template>
  <main id="main" class="wrap">
    <h2>{{ $t('notFound') }}</h2>
    <RouterLink :to="{ name: 'discover' }" class="btn primary" style="align-self: flex-start">{{ $t('nav.discover') }}</RouterLink>
  </main>
</template>
