document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION & DPI CALCULATIONS ---
    const A4_WIDTH_PX = 794;   // 210mm at 96 DPI (on-screen working size)
    const A4_HEIGHT_PX = 1123; // 297mm at 96 DPI

    const ID_WIDTH_MM = 85.6;
    const ID_HEIGHT_MM = 53.98;

    const MM_TO_PX = A4_WIDTH_PX / 210;
    const ID_WIDTH_PX = ID_WIDTH_MM * MM_TO_PX;
    const ID_HEIGHT_PX = ID_HEIGHT_MM * MM_TO_PX;

    // QUALITY FIX: export/print resolution.
    // 300 DPI = sharp print. 600 gives more detail but may fail on phones (canvas size limits).
    const EXPORT_DPI = 300;
    const EXPORT_MULTIPLIER = EXPORT_DPI / 96;

    // --- QUALITY FIX: global Fabric rendering settings ---
    // Avoid low-resolution cached bitmaps for objects
    fabric.Object.prototype.objectCaching = false;
    fabric.Image.prototype.imageSmoothing = true;

    // Force high-quality resampling whenever an image is drawn/downscaled
    const originalImageRender = fabric.Image.prototype._render;
    fabric.Image.prototype._render = function (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        originalImageRender.call(this, ctx);
    };

    // State Variables
    let frontImgObj = null;
    let backImgObj = null;
    let cropper = null;
    let marginGuideObj = null;

    // --- INITIALIZE FABRIC.JS CANVAS ---
    const canvas = new fabric.Canvas('id-canvas', {
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        backgroundColor: '#ffffff',
        selection: true,
        enableRetinaScaling: true,   // sharper preview on HiDPI screens
        imageSmoothingEnabled: true
    });

    const drawPageMarginGuides = () => {
        marginGuideObj = new fabric.Rect({
            left: 20,
            top: 20,
            width: A4_WIDTH_PX - 40,
            height: A4_HEIGHT_PX - 40,
            fill: 'transparent',
            stroke: '#E2E8F0',
            strokeWidth: 1,
            strokeDashArray: [5, 5],
            selectable: false,
            evented: false
        });
        canvas.add(marginGuideObj);
        canvas.sendToBack(marginGuideObj);
    };
    drawPageMarginGuides();

    // --- HELPERS ---
    const styleImage = (img) => {
        img.set({
            cornerColor: '#0D9488',
            cornerStyle: 'circle',
            borderColor: '#0D9488',
            cornerSize: 10,
            transparentCorners: false,
            objectCaching: false
        });
    };

    const scaleToId = (img) => {
        const scale = ID_WIDTH_PX / img.width;
        img.set({ scaleX: scale, scaleY: scale });
        img.setCoords();
    };

    // Used by drag-drop and paste: fills the front slot first, then the back slot
    const addImageAutoSlot = (img) => {
        const centerX = (A4_WIDTH_PX - ID_WIDTH_PX) / 2;
        scaleToId(img);
        styleImage(img);

        if (!frontImgObj) {
            frontImgObj = img;
            img.set({ left: centerX, top: 100 });
        } else if (!backImgObj) {
            backImgObj = img;
            img.set({ left: centerX, top: 100 + ID_HEIGHT_PX + 30 });
        } else {
            img.set({ left: centerX, top: 150 });
        }

        img.setCoords();
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
    };

    const loadFileAsImage = (file, callback) => {
        const reader = new FileReader();
        reader.onload = (event) => fabric.Image.fromURL(event.target.result, callback);
        reader.readAsDataURL(file);
    };

    // --- UPLOAD ---
    const handleFileUpload = (e, isFront = true) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        loadFileAsImage(file, (img) => {
            scaleToId(img);
            styleImage(img);

            if (isFront) {
                if (frontImgObj) canvas.remove(frontImgObj);
                frontImgObj = img;
                img.set({ left: (A4_WIDTH_PX - ID_WIDTH_PX) / 2, top: 100 });
            } else {
                if (backImgObj) canvas.remove(backImgObj);
                backImgObj = img;
                img.set({ left: (A4_WIDTH_PX - ID_WIDTH_PX) / 2, top: 100 + ID_HEIGHT_PX + 30 });
            }

            img.setCoords();
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.renderAll();
        });
    };

    document.getElementById('front-id-input').addEventListener('change', (e) => handleFileUpload(e, true));
    document.getElementById('back-id-input').addEventListener('change', (e) => handleFileUpload(e, false));

    // --- QUICK PRESETS ---
    document.getElementById('preset-stacked').addEventListener('click', () => {
        const imgs = canvas.getObjects().filter(obj => obj.type === 'image');
        if (imgs.length === 0) return alert("Please upload at least one ID image first.");

        const startY = 120;
        const centerX = (A4_WIDTH_PX - ID_WIDTH_PX) / 2;

        imgs.forEach((img, idx) => {
            img.set({ left: centerX, top: startY + idx * (ID_HEIGHT_PX + 40), angle: 0 });
            img.scaleToWidth(ID_WIDTH_PX);
            img.setCoords();
        });
        canvas.renderAll();
    });

    document.getElementById('preset-side').addEventListener('click', () => {
        const imgs = canvas.getObjects().filter(obj => obj.type === 'image');
        if (imgs.length < 2) return alert("Please upload both Front and Back ID images.");

        const gap = 30;
        const totalWidth = (ID_WIDTH_PX * 2) + gap;
        const startX = (A4_WIDTH_PX - totalWidth) / 2;

        imgs[0].set({ left: startX, top: 150, angle: 0 });
        imgs[1].set({ left: startX + ID_WIDTH_PX + gap, top: 150, angle: 0 });
        imgs.forEach(img => { img.scaleToWidth(ID_WIDTH_PX); img.setCoords(); });
        canvas.renderAll();
    });

    // --- CROP MODE ---
    const cropModal = document.getElementById('crop-modal');
    const cropImgElement = document.getElementById('crop-image');

    document.getElementById('crop-btn').addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (!activeObj || activeObj.type !== 'image') {
            return alert("Please click and select an ID image on the canvas to crop.");
        }

        // Full-resolution source (never the downscaled canvas rendering)
        const src = activeObj._element ? activeObj._element.src : activeObj.toDataURL();
        cropImgElement.src = src;
        cropModal.classList.add('active');

        if (cropper) cropper.destroy();
        cropper = new Cropper(cropImgElement, {
            viewMode: 1,
            autoCropArea: 0.95,
            responsive: true
        });
    });

    const closeCropModal = () => {
        cropModal.classList.remove('active');
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
    };

    document.getElementById('close-modal-btn').addEventListener('click', closeCropModal);
    document.getElementById('cancel-crop-btn').addEventListener('click', closeCropModal);

    document.getElementById('apply-crop-btn').addEventListener('click', () => {
        if (!cropper) return;

        const activeObj = canvas.getActiveObject();
        if (!activeObj) return;

        // Full-resolution crop, high-quality smoothing, no size cap
        const croppedCanvas = cropper.getCroppedCanvas({
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
            maxWidth: 8192,
            maxHeight: 8192
        });
        const croppedDataUrl = croppedCanvas.toDataURL('image/png'); // lossless

        const left = activeObj.left;
        const top = activeObj.top;
        const angle = activeObj.angle;

        activeObj.setSrc(croppedDataUrl, () => {
            activeObj.set({ left, top, angle, objectCaching: false });
            const croppedScale = ID_WIDTH_PX / activeObj.width;
            activeObj.set({ scaleX: croppedScale, scaleY: croppedScale });
            activeObj.setCoords();
            canvas.renderAll();
            closeCropModal();
        });
    });

    // --- LAYER ORDERING & MARGIN TOGGLE ---
    document.getElementById('bring-forward-btn').addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
            canvas.bringForward(activeObj);
            canvas.renderAll();
        }
    });

    document.getElementById('send-backward-btn').addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
            canvas.sendBackwards(activeObj);
            if (marginGuideObj) canvas.sendToBack(marginGuideObj);
            canvas.renderAll();
        }
    });

    document.getElementById('toggle-margin-btn').addEventListener('click', () => {
        if (marginGuideObj) {
            marginGuideObj.set('visible', !marginGuideObj.visible);
            canvas.renderAll();
        }
    });

    document.getElementById('rotate-btn').addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
            activeObj.rotate((activeObj.angle + 90) % 360);
            canvas.renderAll();
        }
    });

    document.getElementById('center-h-btn').addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
            activeObj.centerH();
            canvas.renderAll();
        }
    });

    document.getElementById('delete-btn').addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
            canvas.remove(activeObj);
            if (activeObj === frontImgObj) frontImgObj = null;
            if (activeObj === backImgObj) backImgObj = null;
            canvas.renderAll();
        }
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        if (confirm("Are you sure you want to clear the sheet?")) {
            canvas.clear();
            frontImgObj = null;
            backImgObj = null;

            document.getElementById('front-id-input').value = '';
            document.getElementById('back-id-input').value = '';

            canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
            drawPageMarginGuides();
        }
    });

    // --- QUALITY FIX: HIGH-RESOLUTION RENDER (shared by Print and PDF) ---
    const renderHighRes = () => {
        canvas.discardActiveObject();

        // Hide the dashed margin guide so it doesn't appear in the output
        const guideWasVisible = marginGuideObj ? marginGuideObj.visible : false;
        if (marginGuideObj) marginGuideObj.set('visible', false);
        canvas.renderAll();

        const dataURL = canvas.toDataURL({
            format: 'png',                       // lossless (no JPEG artifacts)
            multiplier: EXPORT_MULTIPLIER,       // ~300 DPI
            enableRetinaScaling: false           // multiplier alone controls resolution
        });

        if (marginGuideObj) marginGuideObj.set('visible', guideWasVisible);
        canvas.renderAll();

        return dataURL;
    };

    // --- DIRECT PRINT (prints the 300 DPI render, not the screen canvas) ---
    document.getElementById('print-btn').addEventListener('click', async () => {
        const dataURL = renderHighRes();
        const blob = await (await fetch(dataURL)).blob();
        const blobUrl = URL.createObjectURL(blob);

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
        iframe.srcdoc = `<!DOCTYPE html><html><head><style>
            @page { size: A4; margin: 0; }
            html, body { margin: 0; padding: 0; }
            img { display: block; width: 210mm; height: 297mm; }
        </style></head><body><img src="${blobUrl}"></body></html>`;

        iframe.onload = () => {
            const win = iframe.contentWindow;
            const img = iframe.contentDocument.querySelector('img');
            const doPrint = () => {
                win.focus();
                win.print();
            };
            win.onafterprint = () => {
                iframe.remove();
                URL.revokeObjectURL(blobUrl);
            };
            if (img.complete) doPrint();
            else img.onload = doPrint;
        };

        document.body.appendChild(iframe);
    });

    // --- PDF EXPORT (lossless PNG at 300 DPI) ---
    document.getElementById('export-pdf-btn').addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: false });

        const dataURL = renderHighRes();

        pdf.addImage(dataURL, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
        pdf.save(`Huduma_ID_Print_${new Date().toISOString().slice(0, 10)}.pdf`);
    });

    // --- DRAG AND DROP ---
    const dragOverlay = document.getElementById('drag-drop-overlay');
    let dragCounter = 0;
    const hasFiles = (e) => e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');

    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (!hasFiles(e)) return;
        dragCounter++;
        dragOverlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (!hasFiles(e)) return;
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            dragOverlay.classList.remove('active');
        }
    });

    window.addEventListener('dragover', (e) => e.preventDefault());

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dragOverlay.classList.remove('active');

        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        files.forEach((file) => loadFileAsImage(file, addImageAutoSlot));
    });

    // --- PASTE IMAGE FROM CLIPBOARD (CTRL+V) ---
    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;

        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                loadFileAsImage(item.getAsFile(), addImageAutoSlot);
                break;
            }
        }
    });
});