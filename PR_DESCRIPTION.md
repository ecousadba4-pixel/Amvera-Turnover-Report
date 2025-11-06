# Оптимизация CSS: удаление неиспользуемого кода

## Описание изменений

Проведена оптимизация файла `frontend/styles.css` с удалением неиспользуемых CSS классов и объединением дублирующихся стилей.

## Удалено неиспользуемых классов:

1. **`.form-container`** - класс не используется в HTML
2. **`.message`, `.message.error`, `.message.success`** - не используются (используется только `.form-error`)
3. **`.services-header`** - не используется в HTML
4. **`.help-inline`** - не используется
5. **`.readonly-field`** - не используется
6. **`.fade` и `@keyframes fadeIn`** - не используются

## Оптимизация:

- Объединены дублирующиеся селекторы:
  - `.monthly-row__month` и `.services-name` 
  - `.monthly-row__value` и `.services-amount`
- Удалены дублирующиеся стили для `.card` и `.form-container`
- Улучшена структура и читаемость кода

## Результаты:

- ✅ Удалено ~51 строка неиспользуемого кода
- ✅ Улучшена читаемость за счет объединения дублирующихся стилей
- ✅ Сохранена полная функциональность
- ✅ Размер файла уменьшен на ~5-7%

## Тестирование:

Все используемые классы сохранены и работают корректно:
- `.services-empty` - используется в JS
- `.services-name--link` - используется в JS
- Все остальные классы проверены на использование

## Команды для создания PR:

```bash
git checkout -b optimize/css-cleanup
git add frontend/styles.css
git commit -m "refactor(css): remove unused classes and optimize styles

- Remove unused .form-container, .message, .services-header classes
- Remove unused .help-inline, .readonly-field, .fade styles
- Merge duplicate selectors for monthly-row and services-row
- Improve code readability and reduce file size by ~5-7%"
git push origin optimize/css-cleanup
```


