# UI Smoke Check (Static)

## Local launch

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/index.html`.

## Style switch (Brutalism/Paper)

```js
localStorage.setItem("appStyle", "paper");
location.reload();
```

```js
localStorage.setItem("appStyle", "brutalism");
location.reload();
```

## Dark mode

```js
localStorage.setItem("display_theme", "dark");
location.reload();
```

```js
localStorage.setItem("display_theme", "light");
location.reload();
```

## UI toggles

- Dark mode toggle: `#themeToggleBtn`

## Minimum checks

- Tabs render and switch correctly
- Modal opens/closes and layout is intact
- Mobile layout toggle does not break the header
- Meeting mode layout is intact
- Toast notification styling is intact
