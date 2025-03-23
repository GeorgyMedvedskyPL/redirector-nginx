const urlsInput = getElement("#inputUrls");
const targetUrl = getElement("#targetUrl");
const generateButton = getElement("#generateButton");
const copyButton = getElement("#copyButton");
const downloadButton = getElement("#downloadButton");
const resetButton = getElement("#clearButton");
const output = getElement("#output");
const notification = getElement("#notification");
const error = getElement("#error");
const popupElements = {
  POPUP: getElement('.popup'),
  MESSAGE: getElement('.popup__message'),
  CLOSE_BTN: getElement('.popup__close')
};

function getElement(selector) {
  return selector ? document.querySelector(selector) : null;
}

function setShielding(str) {
  return str.replace(/([.*+?^${}()|])/g, '\\$1');
}

function getTemplateForSearch(key, value) {
  const shieldedKey = setShielding(key);
  const shieldedValue = setShielding(value);
  const template = `if ($args ~* "^${shieldedKey}=${shieldedValue}(.*)$") {\n  return 301 $target_url_;\n}\n\n`;
  return template;
}

function getTemplateForUrl(path) {
  const shieldedPath = setShielding(path);
  const template = `rewrite (?i)^/${shieldedPath}(.*)$ $target_url_ permanent;`;
  return template;
}

const excludedResults = [
  'rewrite (?i)^/(.*)$ $target_url_ permanent;'
];

function openPopup(message, data) {
  data.forEach(item => {
    const str = document.createElement('p');
    str.textContent = item;
    popupElements.POPUP.appendChild(str);
  });
  popupElements.MESSAGE.textContent = message;
  popupElements.POPUP.classList.add('popup_open');
}

function closePopup() {
  popupElements.MESSAGE.textContent = '';
  popupElements.POPUP.classList.remove('popup_open');
}

popupElements.CLOSE_BTN ? popupElements.CLOSE_BTN.addEventListener('click', closePopup) : null;

function generateNginxRedirects(urls, targetUrl) {
  const targetUrlLine = `set $target_url_ ${targetUrl.trim()};\n\n`;
  const groupedRedirects = new Set();
  const existingRedirects = new Set();
  let queryRedirects = '';
  let redirects = null;
  let subdomens = [];

  urls.forEach(url => {
    try {
      const parsedUrl = new URL(url);
      const canonical = new URL(targetUrl);
      const path = decodeURIComponent(parsedUrl.pathname).replaceAll(' ',  '\\s');
      const clipPath = path.split('/')[1];
      const params = parsedUrl.searchParams;

      if(parsedUrl.host !== canonical.host
        && parsedUrl.host !== `www.${canonical.host}`
      ) subdomens.push(parsedUrl.host);
  
      if ([...params.keys()].length > 0) {
        let redirectConditionAdded = false;
        for (const [key, value] of params) {
          const clipValue = value.split(/[\s\/]/)[0];
          const redirectCondition = getTemplateForSearch(key, clipValue);
          if (!existingRedirects.has(redirectCondition)) {
            queryRedirects += redirectCondition;
            existingRedirects.add(redirectCondition);
            redirectConditionAdded = true;
          }
        }
        if (redirectConditionAdded) return;
      } else {
        groupedRedirects[clipPath] = clipPath;
        redirects = Object.keys(groupedRedirects).map((path) => {
          return getTemplateForUrl(path);
        });
      }
    } catch (err) {
      console.log(`Error: ${err.message}`, url);
    }
  });

  if(subdomens.length > 0) {
    openPopup(`В приведенном списке адресов обнаружены поддомены:\n`, subdomens)
  };

  redirects = redirects.filter(item => !excludedResults.includes(item));
  return targetUrlLine + queryRedirects + redirects.join('\n');
}

generateButton.addEventListener("pointerup", () => {
  const targetUrlValue = targetUrl.value.trim();
  const urls = urlsInput.value
    .split("\n")
    .map((url) => url.trim());
  error.textContent = "";

  if (!targetUrlValue) {
    error.textContent = "Пожалуйста, введите целевой URL";
  } else {
    output.textContent = generateNginxRedirects(urls, targetUrlValue);
  }
});

copyButton.addEventListener("pointerup", () => {
  navigator.clipboard
    .writeText(output.textContent)
    .then(() => {
      notification.textContent = "Вывод скопирован в буфер обмена!";
      setTimeout(() => {
        notification.textContent = "";
      }, 3000);
    })
    .catch((err) => {
      console.error("Ошибка при копировании: ", err);
    });
});

downloadButton.addEventListener("pointerup", () => {
  const outputText = output.textContent;
  const blob = new Blob([outputText], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = "redirects.conf";
  link.click();
  window.URL.revokeObjectURL(link.href);
});

resetButton.addEventListener("pointerup", () => {
  urlsInput.value = "";
  targetUrl.value = "";
  output.textContent = "";
  notification.textContent = "";
  error.textContent = "";
});