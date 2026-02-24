/* -------------------------------------------
 * happytreedice-daggerheart-art — v13 Compendium Art integration
 * Replaces images using "Babele-style" Data Interception.
 * * METHOD: In-Memory Overlay.
 * 1. Patches Compendium.getIndex -> Updates icons in the list view.
 * 2. Patches Compendium.getDocument -> Updates opened sheets and drag-and-drop data.
 * 3. Supports both Items and Actors (Adversaries).
 * ------------------------------------------- */

const MODULE_ID = "happytreedice-daggerheart-art";

// Глобальный кэш для маппинга
let MAPPING_DATA = {};
let MAPPING_DATA_LOADED = false;

/**
 * Загрузка mapping.json
 */
async function preloadMappingData() {
  console.log(`[${MODULE_ID}] Загрузка mapping.json...`);
  const mappingPath = `modules/${MODULE_ID}/mapping.json`;

  try {
    const response = await fetch(mappingPath);
    if (response.ok) {
      MAPPING_DATA = await response.json();
      MAPPING_DATA_LOADED = true;
      console.log(`[${MODULE_ID}] Mapping загружен. Перехватчики данных активированы.`);
    } else {
      console.warn(`[${MODULE_ID}] Не удалось загрузить mapping: ${response.status}`);
    }
  } catch (error) {
    console.error(`[${MODULE_ID}] Ошибка загрузки:`, error);
  }
}

/* ---------------- Hooks: bootstrap ---------------- */

Hooks.once("init", () => {
  console.info(`[${MODULE_ID}] Initializing Babele-style Art Interceptor...`);

  // --- 1. ПЕРЕХВАТЧИК ИНДЕКСА (ИКОНКИ В СПИСКЕ) ---
  // Сохраняем оригинальный метод получения индекса
  const originalGetIndex = CompendiumCollection.prototype.getIndex;

  CompendiumCollection.prototype.getIndex = async function (options = {}) {
    // Принудительно запрашиваем поле 'img', чтобы мы могли его заменить.
    // Если его не запросить, Foundry загрузит только ID и Name.
    if (options.fields) {
      if (!options.fields.includes("img")) options.fields.push("img");
    } else {
      options.fields = ["img"];
    }

    // Вызываем оригинал, чтобы получить данные из БД
    const index = await originalGetIndex.call(this, options);

    // Если маппинг не готов, отдаем как есть
    if (!MAPPING_DATA_LOADED) return index;

    const packId = this.collection;
    const mapping = MAPPING_DATA[packId];

    // Если для этого пака есть правила замены
    if (mapping) {
      index.forEach(entry => {
        const data = mapping[entry._id];
        if (data && data.img) {
          // Подменяем иконку в списке
          entry.img = data.img;

          // Для совместимости с разными версиями UI (v10-v12)
          if (entry.thumb) entry.thumb = data.img;
          if (entry.thumbnail) entry.thumbnail = data.img;
        }
      });
    }

    return index;
  };


  // --- 2. ПЕРЕХВАТЧИК ДОКУМЕНТА (ОТКРЫТИЕ / ДРАГ-Н-ДРОП) ---
  // Сохраняем оригинальный метод получения документа
  const originalGetDocument = CompendiumCollection.prototype.getDocument;

  CompendiumCollection.prototype.getDocument = async function (id) {
    // Получаем оригинальный документ из БД
    const doc = await originalGetDocument.call(this, id);

    if (!MAPPING_DATA_LOADED || !doc) return doc;

    const packId = this.collection;
    const mapping = MAPPING_DATA[packId];

    if (mapping) {
      const data = mapping[id];
      if (data && data.img) {
        // 1. Подменяем основное изображение (Портрет Актёра или Иконка Предмета)
        doc.img = data.img;

        // Также подменяем в сырых данных (_source), чтобы Foundry считала это родным значением
        if (doc._source) doc._source.img = data.img;

        // 2. Специальная логика для Актёров (Adversaries)
        // Если это Актёр, нужно обновить и его Токен, иначе на карте будет старая картинка
        if (doc.documentName === "Actor") {
          const tokenImg = data.img; // Используем то же изображение для токена

          // Обновляем прототип токена в объекте документа
          if (doc.prototypeToken && doc.prototypeToken.texture) {
            doc.prototypeToken.texture.src = tokenImg;
          }

          // Обновляем прототип токена в сырых данных
          if (doc._source.prototypeToken && doc._source.prototypeToken.texture) {
            doc._source.prototypeToken.texture.src = tokenImg;
          }
        }
      }
    }

    return doc;
  };
});

Hooks.once("ready", async () => {
  await preloadMappingData();

  // Принудительное обновление интерфейса
  console.log(`[${MODULE_ID}] Обновление отображения компендиумов...`);

  for (const pack of game.packs) {
    // Если этот пак есть в нашем маппинге
    if (MAPPING_DATA[pack.collection]) {
      // Очищаем кэш индекса этого пака, чтобы он пересобрался через наш перехватчик
      pack.clear();

      // Если окно этого компендиума открыто прямо сейчас — перерисовываем его
      pack.apps.forEach(app => app.render());
    }
  }

  // Обновляем боковую панель компендиумов
  ui.sidebar.render();
});