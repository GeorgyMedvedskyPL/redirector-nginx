document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const urlsInput = document.querySelector("#inputUrls");
  const targetUrl = document.querySelector("#targetUrl");
  const generateButton = document.querySelector("#generateButton");
  const copyButton = document.querySelector("#copyButton");
  const downloadButton = document.querySelector("#downloadButton");
  const resetButton = document.querySelector("#clearButton");
  const output = document.querySelector("#output");
  const notification = document.querySelector("#notification");
  const error = document.querySelector("#error");
  const popupTemplate = document.querySelector("#popup").content;

  const popupType = {
    WARNING: "popup__divider_warning",
    ERROR: "popup__divider_error",
  };

  const modals = {
    warning: createPopup(`В приведенном списке адресов обнаружены поддомены:\n`, popupType.WARNING),
    error: createPopup(`Невозможно обработать следующие адреса:\n`, popupType.ERROR)
  };

  let errors = new Set();
  let subdomains = new Set();

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
  }

  function escapeRegExp(str) {
    return str.replace(/([.*+?^${}()|])/g, "\\$1");
  }

  function queryRedirectTemplate(key, value) {
    return `if ($args ~* "^${escapeRegExp(key)}=${escapeRegExp(value)}(.*)$") {\n  return 301 $target_url_;\n}\n\n`;
  }

  function defaultRedirectTemplate(path, isCutted) {
    return `rewrite (?i)^/${escapeRegExp(path)}${isCutted ? '(.*)' : '/?'}$ $target_url_ permanent;`;
  }

  const excludedResults = [
    "rewrite (?i)^/(.*)$ $target_url_ permanent;",
    "rewrite (?i)^//?$ $target_url_ permanent;",
    "rewrite (?i)^/index\.php(.*)$ $target_url_ permanent;",
  ];

  function createPopup(message, type) {
    const popup = popupTemplate.querySelector(".popup").cloneNode(true);
    const id = generateUUID();
    const divider = popup.querySelector(".popup__divider");
    const closeBtn = popup.querySelector(".popup__close");
    const title = popup.querySelector(".popup__message");

    popup.setAttribute('id', id);
    title.textContent = message;
    divider.classList.add(type);
    closeBtn.addEventListener("click", () => closePopup(popup));

    if (type === popupType.ERROR) {
      popup.classList.add("popup_type_error");
    }

    body.appendChild(popup);
    return popup;
  }

  function openPopup(popup, data) {
    const content = popup.querySelector(".popup__content");
    if (!popup.classList.contains("popup_open")) {
      data.forEach((item) => {
        const str = document.createElement("p");
        str.textContent = item;
        content.appendChild(str);
      });
      popup.classList.add("popup_open");
    }
  }

  function closePopup(popup) {
    popup.classList.remove("popup_open");
    subdomains.clear();
    errors.clear();
    Array.from(popup.querySelectorAll('p')).forEach(element => {
      element.remove();
    });
  }

  function generateNginxRedirects(urls, targetUrl) {
    const targetUrlLine = `set $target_url_ ${targetUrl.trim()};\n\n`;
    const groupedRedirects = new Map();
    const existingRedirects = new Set();
    let queryRedirects = "";
  
    urls.forEach(url => {
      try {
        const parsedUrl = new URL(url);
        const canonical = new URL(targetUrl);
        const path = decodeURIComponent(parsedUrl.pathname).replaceAll(" ", "\\s");
        const segments = path.split("/").filter(Boolean);

        const params = parsedUrl.searchParams;

        if (parsedUrl.host !== canonical.host && parsedUrl.host !== `www.${canonical.host}`) {
          subdomains.add(parsedUrl.host);
        }

        if ([...params.keys()].length > 0) {
          for (const [key, value] of params) {
            const clipValue = value.split(/[\s\/]/)[0];
            const redirectCondition = queryRedirectTemplate(key, clipValue);
            if (!existingRedirects.has(redirectCondition)) {
              queryRedirects += redirectCondition;
              existingRedirects.add(redirectCondition);
            }
          }
        } else if (segments.length > 0) {
          const firstSegment = segments[0];
          const isCutted = segments.length > 1;

          if (groupedRedirects.has(firstSegment)) {
            if (isCutted) {
              groupedRedirects.set(firstSegment, true);
            }
          } else {
            groupedRedirects.set(firstSegment, isCutted);
          }
        }
      } catch (err) {
        console.error(`Error: ${err.message}`, url);
        errors.add(`${url}\n\n`);
      }
    });
  
    const redirects = Array.from(groupedRedirects.entries()).map(([path, isCutted]) => defaultRedirectTemplate(path, isCutted));
    const finalRedirects = redirects.filter(item => !excludedResults.includes(item));
    return targetUrlLine + queryRedirects + finalRedirects.join("\n");
  }

  generateButton.addEventListener("pointerup", () => {
    const targetUrlValue = targetUrl.value.trim();
    const urls = urlsInput.value.split("\n").map(url => url.trim());
    error.textContent = "";

    if (!targetUrlValue) {
      error.textContent = "Пожалуйста, введите целевой URL";
    } else {
      const result = generateNginxRedirects(urls, targetUrlValue);
      output.textContent = result;
      if (subdomains.size > 0) openPopup(modals.warning, subdomains);
      if (errors.size > 0) openPopup(modals.error, errors);
    }
  });

  copyButton.addEventListener("pointerup", () => {
    navigator.clipboard.writeText(output.textContent)
      .then(() => {
        notification.textContent = "Вывод скопирован в буфер обмена!";
        setTimeout(() => notification.textContent = "", 3000);
      })
      .catch(err => console.error("Ошибка при копировании: ", err));
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
    for(let key in modals) {
      closePopup(modals[key]);
    }
  });
});
