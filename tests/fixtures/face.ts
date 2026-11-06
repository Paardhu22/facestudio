import sharp from 'sharp';

/**
 * A detailed, photo-like ILLUSTRATED face (gradients, shading, soft edges): original artwork, not a photograph of a real
 * person (SKILLS.md §D.9). Verified to be detected by the BlazeFace short-range model (score ≈ 0.92 with 6 landmarks), so it
 * lets browser tests run the real detection pipeline. 640 × 640.
 */
const FACE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
<defs>
 <radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#9fb1c4"/><stop offset="1" stop-color="#4c5d70"/></radialGradient>
 <radialGradient id="skin" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#f1c9a8"/><stop offset="0.65" stop-color="#d9a37f"/><stop offset="1" stop-color="#b9805c"/></radialGradient>
 <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2618"/><stop offset="1" stop-color="#1d120b"/></linearGradient>
 <radialGradient id="iris" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#1b0f08"/><stop offset="0.45" stop-color="#5b3a22"/><stop offset="1" stop-color="#2d1b10"/></radialGradient>
 <linearGradient id="shirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34495e"/><stop offset="1" stop-color="#22303d"/></linearGradient>
 <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter><filter id="soft2"><feGaussianBlur stdDeviation="2.2"/></filter>
</defs>
<rect width="640" height="640" fill="url(#bg)"/>
<path d="M60 640 C70 520 190 470 320 465 C450 470 570 520 580 640Z" fill="url(#shirt)"/>
<path d="M265 430 L375 430 L385 500 C350 530 290 530 255 500Z" fill="#c48f6b"/>
<ellipse cx="320" cy="470" rx="62" ry="22" fill="#a3714f" filter="url(#soft)" opacity="0.55"/>
<ellipse cx="222" cy="305" rx="20" ry="38" fill="#c68d68"/><ellipse cx="418" cy="305" rx="20" ry="38" fill="#c68d68"/>
<path d="M205 280 C195 120 445 120 435 280 C440 400 395 470 320 478 C245 470 200 400 205 280Z" fill="url(#skin)"/>
<path d="M200 300 C170 140 280 70 330 78 C440 80 480 190 440 300 C430 235 410 195 380 175 C330 205 270 200 232 175 C212 200 205 250 200 300Z" fill="url(#hair)"/>
<ellipse cx="320" cy="400" rx="100" ry="50" fill="#a86f4d" opacity="0.18" filter="url(#soft)"/>
<ellipse cx="262" cy="300" rx="40" ry="20" fill="#f6f1ea"/><ellipse cx="378" cy="300" rx="40" ry="20" fill="#f6f1ea"/>
<circle cx="264" cy="300" r="17" fill="url(#iris)"/><circle cx="376" cy="300" r="17" fill="url(#iris)"/>
<circle cx="264" cy="300" r="7" fill="#050302"/><circle cx="376" cy="300" r="7" fill="#050302"/>
<circle cx="258" cy="294" r="3.2" fill="#fff" opacity="0.9"/><circle cx="370" cy="294" r="3.2" fill="#fff" opacity="0.9"/>
<path d="M218 292 C240 270 285 270 304 290 C285 281 240 281 218 292Z" fill="#3a2618"/><path d="M336 290 C356 270 400 270 422 292 C400 281 356 281 336 290Z" fill="#3a2618"/>
<path d="M222 262 C245 242 285 246 304 262" stroke="#2a190f" stroke-width="9" fill="none" stroke-linecap="round"/>
<path d="M336 262 C355 246 395 242 418 262" stroke="#2a190f" stroke-width="9" fill="none" stroke-linecap="round"/>
<path d="M320 300 C315 340 300 365 296 380 C310 392 332 392 346 380 C340 365 326 340 320 300Z" fill="#c68d68" opacity="0.55" filter="url(#soft2)"/>
<ellipse cx="305" cy="383" rx="7" ry="4.5" fill="#6b3d28"/><ellipse cx="336" cy="383" rx="7" ry="4.5" fill="#6b3d28"/>
<path d="M270 425 C295 418 345 418 372 425 C350 452 292 452 270 425Z" fill="#a8504a"/>
<path d="M270 425 C295 432 345 432 372 425" stroke="#6d2f2c" stroke-width="3" fill="none"/>
<path d="M280 432 C300 446 342 446 362 432 C345 454 297 454 280 432Z" fill="#c36a63" opacity="0.8"/>
<ellipse cx="268" cy="355" rx="28" ry="16" fill="#e59a86" opacity="0.28" filter="url(#soft)"/><ellipse cx="372" cy="355" rx="28" ry="16" fill="#e59a86" opacity="0.28" filter="url(#soft)"/>
</svg>`;

export function makeFace(): Promise<Buffer> {
  return sharp(Buffer.from(FACE_SVG)).png().toBuffer();
}
