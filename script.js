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
  const warningModal = createPopup(
    `В приведенном списке адресов обнаружены поддомены:\n`,
    popupType.WARNING
  );
  const errorModal = createPopup(
    `Невозможно обработать следующие адреса:\n`,
    popupType.ERROR
  );
  let subdomains = [];
  let errors = [];

  function escapeRegExp(str) {
    return str.replace(/([.*+?^${}()|])/g, "\\$1");
  }

  function createRedirectTemplate(key, value) {
    const escapedKey = escapeRegExp(key);
    const escapedValue = escapeRegExp(value);
    return `if ($args ~* "^${escapedKey}=${escapedValue}(.*)$") {\n  return 301 $target_url_;\n}\n\n`;
  }

  function createUrlTemplate(path) {
    const escapedPath = escapeRegExp(path);
    return `rewrite (?i)^/${escapedPath}(.*)$ $target_url_ permanent;`;
  }

  const excludedResults = ["rewrite (?i)^/(.*)$ $target_url_ permanent;", "rewrite (?i)^/index\.php(.*)$ $target_url_ permanent;"];

  function createPopup(message, type) {
    const popup = popupTemplate.querySelector(".popup").cloneNode(true);
    const divider = popup.querySelector(".popup__divider");
    const closeBtn = popup.querySelector(".popup__close");
    const title = popup.querySelector(".popup__message");

    title.textContent = message;
    divider.classList.add(type);

    closeBtn.addEventListener("click", () => closePopup(popup));

    type === popupType.ERROR ? popup.classList.add("popup_type_error") : null;

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
    subdomains = [];
    errors = [];
    Array.from(popup.querySelectorAll('p')).forEach(element => {
      element.remove();
    });
  }

  function generateNginxRedirects(urls, targetUrl) {
    const targetUrlLine = `set $target_url_ ${targetUrl.trim()};\n\n`;
    const groupedRedirects = new Set();
    const existingRedirects = new Set();
    let queryRedirects = "";

    urls.forEach((url) => {
      try {
        const parsedUrl = new URL(url);
        const canonical = new URL(targetUrl);
        const path = decodeURIComponent(parsedUrl.pathname).replaceAll(
          " ",
          "\\s"
        );
        const clipPath = path.split("/")[1];
        const params = parsedUrl.searchParams;

        if (
          parsedUrl.host !== canonical.host &&
          parsedUrl.host !== `www.${canonical.host}`
        ) {
          subdomains.push(parsedUrl.host);
        }

        if ([...params.keys()].length > 0) {
          let redirectConditionAdded = false;
          for (const [key, value] of params) {
            const clipValue = value.split(/[\s\/]/)[0];
            const redirectCondition = createRedirectTemplate(key, clipValue);
            if (!existingRedirects.has(redirectCondition)) {
              queryRedirects += redirectCondition;
              existingRedirects.add(redirectCondition);
              redirectConditionAdded = true;
            }
          }
          if (redirectConditionAdded) return;
        } else {
          groupedRedirects.add(clipPath);
        }
      } catch (err) {
        console.error(`Error: ${err.message}`, url);
        errors.push(url);
      }
    });
    const redirects = Array.from(groupedRedirects).map(createUrlTemplate);
    const finalRedirects = redirects.filter(
      (item) => !excludedResults.includes(item)
    );
    return targetUrlLine + queryRedirects + finalRedirects.join("\n");
  }

  generateButton.addEventListener("pointerup", () => {
    const targetUrlValue = targetUrl.value.trim();
    const urls = urlsInput.value.split("\n").map((url) => url.trim());
    error.textContent = "";

    if (!targetUrlValue) {
      error.textContent = "Пожалуйста, введите целевой URL";
    } else {
      const result = generateNginxRedirects(urls, targetUrlValue);
      output.textContent = result;

      if (subdomains.length > 0) openPopup(warningModal, subdomains);
      if (errors.length > 0) openPopup(errorModal, errors);
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
});
