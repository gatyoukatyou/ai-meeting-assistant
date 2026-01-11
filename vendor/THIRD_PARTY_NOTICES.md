# Third Party Notices

This folder contains third-party libraries distributed with this application.

## pdf.js (pdfjs-dist)

- **Version**: 5.4.530
- **License**: Apache License 2.0
- **Source (upstream)**: https://github.com/mozilla/pdf.js
- **Distribution**: https://www.npmjs.com/package/pdfjs-dist
- **Files**: `pdfjs/pdf.min.mjs`, `pdfjs/pdf.worker.min.mjs`

```
Copyright Mozilla Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

## mammoth

- **Version**: 1.11.0
- **License**: BSD-2-Clause
- **Source**: https://github.com/mwilliamson/mammoth.js
- **Files**: `mammoth/mammoth.browser.min.js`

```
Copyright (c) 2013-present, Michael Williamson
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
```

---

## How to Update Vendor Libraries

1. **pdf.js**: Download `pdf.min.mjs` and `pdf.worker.min.mjs` from [pdfjs-dist npm](https://www.npmjs.com/package/pdfjs-dist) or build from source. Update version number above.
2. **mammoth**: Download `mammoth.browser.min.js` from [mammoth.js releases](https://github.com/mwilliamson/mammoth.js/releases). Update version number above.
3. After updating, verify the app loads and extracts PDF/DOCX files correctly.
