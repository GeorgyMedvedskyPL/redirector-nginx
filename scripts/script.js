window.addEventListener('load', () => {
  const preloader = document.querySelector('.preloader');
  const container = document.querySelector('.container');

  preloader.classList.remove('preloader_visible');
  container.classList.remove('container_blur');
});

document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const container = document.querySelector('.container');
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
  const templateSelect = document.querySelector("#templateSelect");
  const groupCheckbox = document.querySelector('#group');
  const tools = document.querySelector('.tools');
  const toolsBookmark = tools.querySelector('.tools__bookmark');
  const preloader = document.querySelector('.preloader');
  let timer = null;

  toolsBookmark.addEventListener('click', () => {
    if(!tools.classList.contains('tools_open')) {
      tools.classList.add('tools_open');
    } else {
      tools.classList.remove('tools_open');
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.tools')) {
      tools.classList.remove('tools_open');
      }
  });

  const popupType = {
    WARNING: "popup__divider_warning",
    ERROR: "popup__divider_error",
  };

  const modals = {
    warning: createPopup(`The list of url's contains subdomains:\n`, popupType.WARNING),
    error: createPopup(`It is not possible to process the following url's:\n`, popupType.ERROR)
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

  function queryNginxTemplate(key, value, isDecoded) {
    return `if ($args ~* "^${escapeRegExp(key)}=${isDecoded ? '' : escapeRegExp(value)}(.*)$") {\n  return 301 $target_url_;\n}\n\n`;
    // if (excludedQuery.includes(key)) {
    // }
    // return `if ($args ~* "^${escapeRegExp(key)}=(.*)$") {\n  return 301 $target_url_;\n}\n\n`;
  }

  function queryApacheTemplate(key, value) {
    return `RewriteCond %{QUERY_STRING} ^${escapeRegExp(key)}=${escapeRegExp(value)}(.*)$ [NC,OR]\n`;
  }

  function nginxTemplate(path, isGrouped) {
    return `rewrite (?i)^${escapeRegExp(path)}${isGrouped ? '/(.*)' : ''}$ $target_url_ permanent;`;
  }

  function apacheTemplate(path, isLast, isGrouped) {
    return `RewriteCond %{REQUEST_URI} ^${escapeRegExp(path)}${isGrouped ? '/(.*)' : ''}$ [NC${isLast ? '' : ',OR'}]`;
  }

  const excludedUrls = [
    '/',
    '/index.php',
    '/index.html',
    '/sitemap.xml',
    '/robots.txt'
  ];

  const excludedQuery = [
    'a'
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

    if (type === popupType.WARNING) {
      popup.classList.add("popup_type_warning");
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

  function generateRedirects(urls, targetUrl, template) {
    const targetUrlLineForNginx = `set $target_url_ ${targetUrl.trim()};\n\n`;
    const targetUrlLineForApache = `RewriteRule ^(.*)$ ${targetUrl.trim()} [R=301,L]\n\n`;
    const groupedRedirects = new Map();
    const existingRedirects = new Set();
    const isGrouped = groupCheckbox.checked;
    let queryRedirects = "";
  
    urls.forEach(url => {
      try {
        const parsedUrl = new URL(url);
        const canonical = new URL(targetUrl);
        const path = decodeURIComponent(parsedUrl.pathname).replaceAll(" ", "\\s");
        const params = parsedUrl.searchParams;
        const isDecoded = url !== decodeURIComponent(parsedUrl);
  
        if (parsedUrl.host !== canonical.host && parsedUrl.host !== `www.${canonical.host}`) {
          subdomains.add(parsedUrl.host);
        }
  
        if ([...params.keys()].length > 0) {
          for (const [key, value] of params) {
            const clipValue = value.split(/[\s\/]/)[0];
            let redirectCondition = null;

            if(template === "nginx") {
              redirectCondition = queryNginxTemplate(key, clipValue, isDecoded);
            } else if (template === "apache") {
              redirectCondition = queryApacheTemplate(key, clipValue);
            }

            if (!existingRedirects.has(redirectCondition)) {
              queryRedirects += redirectCondition;
              existingRedirects.add(redirectCondition);
            }
            break;
          }
        } else {
          if (excludedUrls.includes(parsedUrl.pathname)) return;
          isGrouped ? groupedRedirects.set(path.split('/')[1], true) : groupedRedirects.set(path, true);
          // groupedRedirects.set(path, true);
        }
      } catch (err) {
        console.error(`Error: ${err.message}`, url);
        errors.add(`${url}\n\n`);
      }
    });
  
    let redirects;
    if (template === "nginx") {
      redirects = Array.from(groupedRedirects.entries()).map(([path]) => nginxTemplate(path, isGrouped));
    } else if (template === "apache") {
      const redirectEntries = Array.from(groupedRedirects.entries());
      redirects = redirectEntries.map(([path], index) => {
        const isLast = index === redirectEntries.length - 1;
        return apacheTemplate(path, isLast, isGrouped);
      });
    }

    if(template === "nginx") {
      return targetUrlLineForNginx + queryRedirects + redirects.join("\n");
    } else if (template === "apache") {
      return queryRedirects + redirects.join("\n") + "\n" + targetUrlLineForApache;
    }
  }

  generateButton.addEventListener("click", () => {
    const targetUrlValue = targetUrl.value.trim();
    const urls = urlsInput.value.split("\n").map(url => url.trim());
    error.textContent = "";
  
    if (!targetUrlValue) {
      error.textContent = "Please enter the target url";
    } else {
      const selectedTemplate = templateSelect.value;
      const result = generateRedirects(urls, targetUrlValue, selectedTemplate);
      if (timer) {
        clearTimeout(timer);
      }
      preloader.classList.add('preloader_visible');
      container.classList.add('container_blur');
      timer = setTimeout(() => {
        preloader.classList.remove('preloader_visible');
        container.classList.remove('container_blur');
        output.textContent = result;
        if (subdomains.size > 0) openPopup(modals.warning, subdomains);
        if (errors.size > 0) openPopup(modals.error, errors);
      }, 2000);
    }
  });

  copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(output.textContent)
      .then(() => {
        notification.textContent = "Copied!";
        setTimeout(() => notification.textContent = "", 3000);
      })
      .catch(err => console.error("Error while copying: ", err));
  });

  downloadButton.addEventListener("click", () => {
    const outputText = output.textContent;
    const blob = new Blob([outputText], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = "redirects.conf";
    link.click();
    window.URL.revokeObjectURL(link.href);
  });

  resetButton.addEventListener("click", () => {
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
