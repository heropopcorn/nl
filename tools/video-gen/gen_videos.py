#!/usr/bin/env python3
"""Batch-run static/视频生成任务清单.md through fal-veo/i2v.py.

Sequential on purpose: the fal balance is small, and a billing failure must stop
the whole run instead of burning the remaining requests.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
I2V = Path(__file__).resolve().parent / "i2v.py"
ASSETS = REPO / "static/GPT台词镜头对照/images/assets"
PREPPED = REPO / "static/GPT台词镜头对照/images/assets_1080"
OUTROOT = REPO / "static/video"
STATE = OUTROOT / "_progress.json"
RESOLUTION = "1080p"
PREP_SIZE = {"1080p": (1920, 1080), "720p": (1280, 720)}


def apply_run_config(*, reverse=False, resolution=None, state=None, outroot=None):
    """Switch batch/output/resolution. Default stays the old 1080p 82-clip run."""
    global TASKS, RESOLUTION, STATE, OUTROOT, PREPPED
    if reverse:
        from reverse_video_tasks import TASKS as RT

        TASKS = RT
        RESOLUTION = resolution or "720p"
        OUTROOT = Path(outroot) if outroot else REPO / "static/video/reverse"
        STATE = Path(state) if state else OUTROOT / "_progress.json"
    else:
        if resolution:
            RESOLUTION = resolution
        if outroot:
            OUTROOT = Path(outroot)
        if state:
            STATE = Path(state)
    PREPPED = REPO / (
        "static/GPT台词镜头对照/images/assets_720"
        if RESOLUTION == "720p"
        else "static/GPT台词镜头对照/images/assets_1080"
    )

BILLING_MARKERS = (
    "402",
    "exhausted balance",
    "insufficient",
    "balance",
    "payment",
    "quota",
    "billing",
)


def tail(allow_stand: bool = False) -> str:
    stand = "" if allow_stand else " Nobody stands up."
    return (
        "Static camera. No camera movement. No zoom.\n"
        "Minimal motion. No large movement.\n"
        f"Everyone stays in place.{stand} Nobody walks out of frame.\n"
        "No new person enters the frame.\n"
        "No text, no caption, no subtitle."
    )


def speak(who: str, gesture: str = "One small natural hand gesture.") -> str:
    return (
        f"{who} speaks naturally.\n"
        "Subtle mouth movement.\n"
        "Occasional blinking.\n"
        "Very slight head movement.\n"
        "Subtle breathing.\n"
        f"{gesture}"
    )


def listen_one(who: str, possessive: str) -> str:
    return (
        f"{who} remains still and listens.\n"
        f"{possessive} lips remain closed and still.\n"
        "No speaking.\n"
        "Occasional blinking.\n"
        "Very subtle breathing.\n"
        "One very slight nod.\n"
        f"Keep {possessive.lower()} hands still."
    )


def listen_many(who: str) -> str:
    return (
        f"{who} remain still and listen.\n"
        "Their lips remain closed and still.\n"
        "No speaking from them.\n"
        "Occasional blinking.\n"
        "Very subtle breathing.\n"
        "Keep their hands still."
    )


def compose(*blocks: str, allow_stand: bool = False) -> str:
    return "\n\n".join([b for b in blocks if b] + [tail(allow_stand)])


# Recurring cast descriptions, phrased by what is visible in the keyframe.
UNI_M = "the man in the dark navy uniform"
UNI_W = "the woman in the dark navy uniform"
COAT = "the person in the white coat"
BOTH_UNI = "The two people in dark navy uniform"

TASKS: list[dict] = []


def add(vid, folder, img, dur, prompt, prio):
    TASKS.append(
        dict(id=vid, folder=folder, img=img, dur=dur, prompt=prompt, prio=prio)
    )


# ---------------------------------------------------------------- H1 会议室
MEET_A = "h1/keyframes/meeting/inspectors_base_new.png"
MEET_B = "h1/keyframes/meeting/zhuren_base_new.png"
SEATED_PAIR = "Both people remain seated at the table."

add("V-MEET-01", "meeting", MEET_A, "8s", "", "P0")  # already generated, skipped
add(
    "V-MEET-02", "meeting", MEET_A, "6s",
    compose(
        SEATED_PAIR,
        f"{UNI_M} on the left lifts the small credential wallet already in his hand "
        "slightly forward to show it, holds it there, and speaks.\n"
        "The lifting motion is small and happens once.\n"
        "Subtle mouth movement.\nOccasional blinking.\nSubtle breathing.",
        listen_one(f"{UNI_W} on the right", "Her")
        + "\nHer eyes move slightly toward the credential.",
    ),
    "P0",
)
add(
    "V-MEET-03", "meeting", MEET_A, "8s",
    compose(SEATED_PAIR, speak(f"{UNI_W} on the right"),
            listen_one(f"{UNI_M} on the left", "His")),
    "P0",
)
add(
    "V-MEET-04", "meeting", MEET_A, "6s",
    compose(
        SEATED_PAIR,
        f"{BOTH_UNI} both remain still and listen to someone off screen.\n"
        "Their lips remain closed and still.\nNo speaking from either of them.\n"
        "Occasional blinking.\nVery subtle breathing.\n"
        "One of them glances down at the notebook once, then looks forward again.",
    ),
    "P0",
)
add(
    "V-MEET-05", "meeting", MEET_B, "8s",
    compose("The person remains seated at the table.", speak(COAT)),
    "P0",
)
add(
    "V-MEET-06", "meeting", MEET_B, "4s",
    compose("The person remains seated at the table.", listen_one(COAT, "His")),
    "P0",
)
add(
    "V-MEET-07", "meeting", MEET_B, "6s",
    compose(
        "The person remains seated at the table.",
        f"{COAT} looks down at the document on the table, signs it with a few short "
        "pen strokes, then lifts the head again and speaks briefly.\n"
        "The pen strokes are small and happen once.\n"
        "Occasional blinking.\nSubtle breathing.",
    ),
    "P1",
)
add(
    "V-MEET-08", "meeting", MEET_A, "4s",
    compose(
        SEATED_PAIR,
        f"{UNI_W} on the right looks down at her notebook and writes a few short "
        "strokes with the pen.\nOnly her hand and wrist move.\n"
        "Her lips remain closed and still.\nOccasional blinking.",
        listen_one(f"{UNI_M} on the left", "His"),
    ),
    "P2",
)

# ------------------------------------------------------------- H1 临床诊区
CLINIC = "h1/keyframes/clinic/group_base_new.png"
CLINIC_STAND = "All three people remain standing where they are."
add(
    "V-CLINIC-01", "clinic", CLINIC, "6s",
    compose(CLINIC_STAND, speak(f"Only {UNI_W} in the middle"),
            listen_many("The other two people")),
    "P0",
)
add(
    "V-CLINIC-02", "clinic", CLINIC, "8s",
    compose(CLINIC_STAND, speak(f"Only {COAT} on the right"),
            listen_many(f"{BOTH_UNI}")),
    "P0",
)
add(
    "V-CLINIC-03", "clinic", CLINIC, "8s",
    compose(
        CLINIC_STAND,
        f"Only {COAT} on the right speaks. While speaking he raises one hand and "
        "makes a single small pointing gesture down the corridor, then lowers it.\n"
        "The gesture happens once. The arm does not swing widely.\n"
        "Subtle mouth movement.\nOccasional blinking.\nSubtle breathing.",
        listen_many(BOTH_UNI)
        + "\nTheir heads turn very slightly toward the pointed direction.",
    ),
    "P1",
)
add(
    "V-CLINIC-04", "clinic", CLINIC, "4s",
    compose(
        CLINIC_STAND,
        "Everyone in the frame remains still.\nAll lips remain closed and still.\n"
        "No speaking from anyone.\nOccasional blinking.\nVery subtle breathing.\n"
        "One very slight weight shift.",
    ),
    "P2",
)

# ------------------------------------------------------------- H1 档案室
ARCH = "h1/keyframes/archive/group_base_new.png"
ARCH_SIT = "All three people remain seated around the table."
add(
    "V-ARCH-01", "archive", ARCH, "6s",
    compose(
        ARCH_SIT,
        f"Only {UNI_W} on the right speaks. While speaking she turns one page of the "
        "open file in front of her with a small hand movement.\n"
        "The page turn happens once.\nSubtle mouth movement.\nOccasional blinking.",
        listen_many("The other two people"),
    ),
    "P0",
)
add(
    "V-ARCH-02", "archive", ARCH, "6s",
    compose(
        ARCH_SIT,
        f"Only {UNI_M} on the left speaks. He turns his head slightly toward "
        f"{COAT} in the middle as he speaks.\n"
        "Subtle mouth movement.\nOccasional blinking.\nSubtle breathing.\n"
        "One small natural hand gesture.",
        listen_many("The other two people"),
    ),
    "P0",
)
add(
    "V-ARCH-03", "archive", ARCH, "8s",
    compose(ARCH_SIT, speak(f"Only {COAT} in the middle"),
            listen_many(BOTH_UNI)),
    "P0",
)

# --------------------------------------------------------- H1 胚胎实验室
LAB = "h1/keyframes/lab/group_base_new.png"
LAB_STAND = "Both people remain standing where they are."
COAT_CAP = "the person in the white coat and blue surgical cap"
add(
    "V-LAB-01", "lab", LAB, "4s",
    compose(LAB_STAND, speak(f"{UNI_M} on the left"),
            listen_one(f"{COAT_CAP} on the right", "His")),
    "P0",
)
add(
    "V-LAB-02", "lab", LAB, "4s",
    compose(
        LAB_STAND,
        f"{COAT_CAP} on the right speaks. While speaking he raises one hand and makes "
        "a single small pointing gesture to the side, then lowers it.\n"
        "The gesture happens once.\nSubtle mouth movement.\nOccasional blinking.",
        listen_one(f"{UNI_M} on the left", "His"),
    ),
    "P0",
)

# ------------------------------------------------------------ DY 部署会
BRIEF = "dy/keyframes/briefing/inspectors_base_new.png"
add(
    "V-DYBRIEF-01", "dy", BRIEF, "8s",
    compose(
        SEATED_PAIR,
        f"{UNI_M} on the left speaks while holding the sheet of paper. Halfway "
        "through he glances down at the paper once, then lifts his eyes again.\n"
        "Subtle mouth movement.\nOccasional blinking.\nSubtle breathing.",
        listen_one(f"{UNI_W} on the right", "Her"),
    ),
    "P0",
)
add(
    "V-DYBRIEF-02", "dy", BRIEF, "6s",
    compose(SEATED_PAIR, speak(f"{UNI_W} on the right"),
            listen_one(f"{UNI_M} on the left", "His")
            + "\nHe keeps holding the sheet of paper."),
    "P0",
)
add(
    "V-DYBRIEF-03", "dy", BRIEF, "6s",
    compose(
        SEATED_PAIR,
        f"{UNI_M} on the left speaks, then lowers the sheet of paper onto the table "
        "in one small movement at the end.\n"
        "Subtle mouth movement.\nOccasional blinking.\nSubtle breathing.",
        listen_one(f"{UNI_W} on the right", "Her"),
    ),
    "P1",
)

# ------------------------------------------------------------ DY 前台
RECEP = "dy/keyframes/reception/four_people_base_new.png"
RECEP_STAND = "All four people remain standing where they are."
ID_MAN = "the man in dark uniform holding the open credential wallet"
OFFICER = "the officer in the lighter uniform standing closest to the counter"
CLERK = "the woman behind the counter"
add(
    "V-DYRECEP-01", "dy", RECEP, "6s",
    compose(
        RECEP_STAND,
        f"Only {ID_MAN} speaks. He lifts the credential slightly forward to show it "
        "and holds it there.\nThe lifting motion is small and happens once.\n"
        "Subtle mouth movement.\nOccasional blinking.",
        listen_many("All the other three people")
        + "\nTheir eyes move slightly toward the credential.",
    ),
    "P0",
)
add(
    "V-DYRECEP-02", "dy", RECEP, "4s",
    compose(
        RECEP_STAND,
        speak(f"Only {CLERK}", "One small hand gesture above the counter."),
        listen_many("The three people standing in front of the counter"),
        "Nobody leans over the counter. Nobody walks around the counter.",
    ),
    "P0",
)
add(
    "V-DYRECEP-03", "dy", RECEP, "6s",
    compose(
        RECEP_STAND,
        f"Only {ID_MAN} speaks. He lowers the credential and raises his other hand to "
        "make a single small pointing gesture down the corridor, then lowers it.\n"
        "The gesture happens once.\nSubtle mouth movement.\nOccasional blinking.",
        listen_many("All the other three people"),
    ),
    "P1",
)
add(
    "V-DYRECEP-04", "dy", RECEP, "4s",
    compose(
        RECEP_STAND,
        f"Only {OFFICER} speaks. He turns very slightly to the side and lifts his own "
        "badge into view in one small movement.\n"
        "Subtle mouth movement.\nOccasional blinking.",
        listen_many("All the other three people"),
    ),
    "P0",
)

# ------------------------------------------------------------ DY 暗门
DOOR = "dy/keyframes/hidden_door/liwei_push_new.png"
add(
    "V-DYDOOR-01", "dy", DOOR, "6s",
    compose(
        "The man pushes the door slowly with his extended hand.\n"
        "The door swings open a little further, and the strip of light from the gap "
        "widens across the floor.\n"
        "The push happens once, slowly, and then stops.\n"
        "His body leans forward very slightly and then settles.\n"
        "His lips remain closed and still.\nOccasional blinking.",
        "He does not step through the doorway. He does not walk away.",
    ),
    "P0",
)
add(
    "V-DYDOOR-02", "dy", DOOR, "4s",
    compose(
        "The man keeps his hand on the door and turns his head to the side to speak.\n"
        "The head turn is small and happens once.\n"
        "Subtle mouth movement.\nOccasional blinking.\nSubtle breathing.",
        "He does not step through the doorway. He does not walk away.",
    ),
    "P1",
)

# ------------------------------------------------------------ DY 手术室
OR_PHOTO = "dy/keyframes/operating_room/wangjing_photo_new.png"
OR_LIWEI = "dy/keyframes/operating_room/liwei_base_new.png"
OR_XL_SIT = "dy/keyframes/operating_room/xiaoliu_seated.png"
OR_WATER = "dy/keyframes/operating_room/wangjing_offer_water_new.png"
OR_XL_CRY = "dy/keyframes/operating_room/xiaoliu_cry.png"
OR_WHISPER = "dy/keyframes/operating_room/liwei_whisper_new.png"
OR_NOTE = "dy/keyframes/operating_room/wangjing_to_xiaoliu_new.png"
OR_WJ = "dy/keyframes/operating_room/wangjing_base_new.png"
OR_ZHOU = "dy/keyframes/operating_room/zhou_base_new.png"

add(
    "V-DYOR-01", "dy", OR_PHOTO, "8s",
    compose(
        "The woman keeps the camera raised in both hands, presses the shutter once "
        "with a very small finger movement, and shifts the camera a few degrees to "
        "the side.\nHer shoulders stay steady. Her elbows stay tucked.\n"
        "She speaks at the same time, with subtle mouth movement behind the camera.\n"
        "Occasional blinking.\nSubtle breathing.\nHer feet stay planted.",
    ),
    "P0",
)
add(
    "V-DYOR-02", "dy", OR_LIWEI, "8s",
    compose("The man remains standing in place.", speak("He"),
            "Keep his feet planted."),
    "P0",
)
add(
    "V-DYOR-03", "dy", OR_LIWEI, "4s",
    compose("The man remains standing in place.", listen_one("He", "His")),
    "P1",
)
add(
    "V-DYOR-04", "dy", OR_XL_SIT, "6s",
    compose(
        "The seated young woman in the pale gown suddenly stands up in one quick "
        "motion, her shoulders tense and her eyes wide, and speaks urgently.\n"
        "The standing up happens once, at the beginning, and then she stays standing "
        "in the same spot.\nAgitated mouth movement.\nRapid blinking.\n"
        "Fast shallow breathing, visible in the shoulders.\nHer hands clench slightly.",
        "She does not step forward. She does not walk.",
        allow_stand=True,
    ),
    "P0",
)
add(
    "V-DYOR-05", "dy", OR_WATER, "6s",
    compose(
        "The woman in uniform extends her arm and holds the paper cup out toward the "
        "seated young woman, and speaks gently.\n"
        "The arm extends once, slowly, and then holds still.\n"
        "Subtle mouth movement.\nOccasional blinking.",
        "The seated young woman raises one hand slightly to take the cup and looks up "
        "at her.\nShe does not speak. Her lips remain closed and still.\n"
        "Occasional blinking.\nSubtle breathing.",
        "Both stay in place. Nobody stands up. Nobody steps forward.",
    ),
    "P0",
)
add(
    "V-DYOR-06", "dy", OR_XL_CRY, "8s",
    compose(
        "The seated young woman stays seated, keeps one hand near her face, and cries "
        "quietly while speaking in broken phrases.\n"
        "Her shoulders tremble very slightly and irregularly.\n"
        "Her head lowers a little, then lifts a little.\n"
        "Trembling mouth movement.\nFrequent blinking, eyes wet.\nUneven breathing.",
        "She does not stand up. She does not walk.",
    ),
    "P0",
)
add(
    "V-DYOR-07", "dy", OR_WHISPER, "6s",
    compose(
        "The man leans in slightly toward the woman beside him, raises one hand near "
        "his mouth, and speaks quietly.\n"
        "The lean is small, only the upper body, and happens once.\n"
        "Subtle mouth movement, small and low.\nOccasional blinking.",
        "The woman stays upright and still, gives one very slight nod, and keeps "
        "looking forward.\nHer lips remain closed and still.",
        "Neither person turns their feet. Neither person walks.",
    ),
    "P0",
)
add(
    "V-DYOR-08", "dy", OR_NOTE, "8s",
    compose(
        "The crouching woman in uniform stays crouched in place, writes a few short "
        "strokes on the clipboard, lifts her head toward the seated young woman, and "
        "speaks gently.\nSubtle mouth movement.\nSmall short pen strokes only.\n"
        "Occasional blinking.",
        "The seated young woman remains seated and listens.\n"
        "Her lips remain closed and still.\nOne very slight nod.\n"
        "Her hands stay resting on her lap.",
        "Nobody stands up. Nobody changes posture.",
    ),
    "P0",
)
add(
    "V-DYOR-09", "dy", OR_WJ, "6s",
    compose(
        "The woman remains standing in place and speaks, and while speaking she "
        "extends the documents in her hand forward in one small slow movement and "
        "holds them there.\nSubtle mouth movement.\nOccasional blinking.\n"
        "Subtle breathing.\nHer feet stay planted.",
    ),
    "P0",
)
add(
    "V-DYOR-10", "dy", OR_WJ, "4s",
    compose(
        "The woman remains standing in place, looks down at the document in her hand "
        "and writes a few short strokes with a pen, then lifts her head slightly.\n"
        "Subtle mouth movement while speaking.\nOccasional blinking.\n"
        "The writing hand makes small short strokes only.",
    ),
    "P0",
)
add(
    "V-DYOR-11", "dy", OR_ZHOU, "4s",
    compose(
        "All three people remain standing where they are.",
        "Only the man in the dark jacket on the right gives one short firm head shake "
        "and speaks one refusing sentence, his jaw tight.\n"
        "The head shake happens once and is small.\nTense mouth movement.\n"
        "Infrequent blinking.\nHis shoulders stay squared.",
        listen_many(BOTH_UNI),
    ),
    "P0",
)
add(
    "V-DYOR-12", "dy", OR_ZHOU, "4s",
    compose(
        "All three people remain standing where they are.",
        "The man in the dark jacket on the right listens with a displeased "
        "expression.\nHis lips remain closed and still.\nNo speaking.\n"
        "Infrequent blinking.\nVery subtle breathing.",
        "The two people in dark navy uniform also remain still.\n"
        "Their lips remain closed and still.\nNo speaking from them.",
    ),
    "P1",
)
add(
    "V-DYOR-13", "dy", OR_PHOTO, "4s",
    compose(
        "The woman keeps the camera raised in both hands, presses the shutter once "
        "with a very small finger movement, and shifts the camera a few degrees to "
        "the side.\nHer shoulders stay steady. Her elbows stay tucked.\n"
        "Her lips remain closed and still. No speaking.\nOccasional blinking.\n"
        "Her feet stay planted.",
    ),
    "P2",
)

# ------------------------------------------------------------ DY 收队
WRAP = "dy/keyframes/hidden_or/inspectors_only_new.png"
WRAP_STAND = "Both people remain standing where they are."
add(
    "V-DYWRAP-01", "dy", WRAP, "8s",
    compose(
        WRAP_STAND,
        f"{UNI_M} on the left glances down at the clipboard in his hand once, lifts "
        "his head, and speaks.\nSubtle mouth movement.\nOccasional blinking.\n"
        "Subtle breathing.",
        listen_one(f"{UNI_W} on the right", "Her"),
    ),
    "P0",
)
add(
    "V-DYWRAP-02", "dy", WRAP, "6s",
    compose(WRAP_STAND, speak(f"{UNI_W} on the right"),
            listen_one(f"{UNI_M} on the left", "His")),
    "P0",
)

# ------------------------------------------------------- H2 妇产科办公室
H2OFF = "h2/keyframes/obgyn_office/group_base_new.png"
H2OFF_POSE = (
    "The two people in dark navy uniform remain standing. "
    "The person in the white coat remains seated behind the desk."
)
add(
    "V-H2OFF-01", "h2", H2OFF, "8s",
    compose(
        H2OFF_POSE,
        f"Only {UNI_M} speaks. He lifts the folder in his hand slightly forward to "
        "show it, holds it there, and keeps speaking.\n"
        "The lifting motion is small and happens once.\n"
        "Subtle mouth movement.\nOccasional blinking.",
        listen_many("The other two people"),
    ),
    "P0",
)
add(
    "V-H2OFF-02", "h2", H2OFF, "6s",
    compose(H2OFF_POSE, speak(f"Only {UNI_W}"), listen_many("The other two people")),
    "P0",
)
add(
    "V-H2OFF-03", "h2", H2OFF, "4s",
    compose(
        H2OFF_POSE,
        f"Only {UNI_M} speaks. He glances down at the document in his hand once, then "
        "lifts his eyes again.\nSubtle mouth movement.\nOccasional blinking.",
        listen_many("The other two people"),
    ),
    "P1",
)

# ------------------------------------------------------- H2 遗传咨询门诊
H2GC = "h2/keyframes/genetic_counseling/group_base_new.png"
H2GC_POSE = (
    "The two people in dark navy uniform remain standing. "
    "The person in the white coat remains seated at the far side of the table."
)
add("V-H2GC-01", "h2", H2GC, "4s",
    compose(H2GC_POSE, speak(f"Only {UNI_M}"), listen_many("The other two people")),
    "P0")
add("V-H2GC-02", "h2", H2GC, "6s",
    compose(H2GC_POSE, speak(f"Only {COAT}"), listen_many(BOTH_UNI)), "P0")
add(
    "V-H2GC-03", "h2", H2GC, "8s",
    compose(
        H2GC_POSE,
        f"Only {UNI_W} speaks. While speaking she turns one page of the open file in "
        "her hands with a small movement.\nThe page turn happens once.\n"
        "Subtle mouth movement.\nOccasional blinking.",
        listen_many("The other two people"),
    ),
    "P0",
)

# ------------------------------------------------------------ H2 超声科
H2US = "h2/keyframes/ultrasound/group_base_new.png"
H2US_POSE = (
    "The two people in dark navy uniform remain standing. "
    "The person in the white coat remains seated at the ultrasound console."
)
add("V-H2US-01", "h2", H2US, "4s",
    compose(H2US_POSE, speak(f"Only {UNI_M}"), listen_many("The other two people")),
    "P0")
add("V-H2US-02", "h2", H2US, "6s",
    compose(H2US_POSE, speak(f"Only {UNI_W}"), listen_many("The other two people")),
    "P0")

# ------------------------------------------------------------ H2 采血点
H2BLOOD = "h2/keyframes/blood_draw/group_base_new.png"
add(
    "V-H2BLOOD-01", "h2", H2BLOOD, "6s",
    compose(
        "The two people in dark navy uniform remain standing outside the counter. "
        "The person in the white coat remains seated behind the counter.",
        speak(f"Only {UNI_W}", "One small hand gesture above the counter."),
        listen_many("The other two people"),
        "Nobody leans over the counter. Nobody walks around the counter.",
    ),
    "P0",
)

# ------------------------------------------------------- H2 分子实验室（口罩）
H2LAB = "h2/keyframes/molecular_lab/group_base_new.png"
H2LAB_POSE = "All three people remain standing where they are. All of them wear masks."


def masked_speak(who: str, gesture: str) -> str:
    return (
        f"Only {who} is addressing the others.\n"
        "The mask moves very slightly with the jaw.\n"
        "The head makes small emphasis nods while explaining.\n"
        f"{gesture}\n"
        "Occasional blinking.\nSubtle breathing."
    )


MASKED_LISTEN = (
    "The other people remain completely still and listen.\n"
    "No head nods from them except one very slight nod at the end.\n"
    "Their hands stay still."
)
add("V-H2LAB-01", "h2", H2LAB, "6s",
    compose(H2LAB_POSE, masked_speak(UNI_W, "One small hand gesture toward the bench."),
            MASKED_LISTEN), "P0")
add("V-H2LAB-02", "h2", H2LAB, "8s",
    compose(H2LAB_POSE,
            masked_speak(COAT, "One small hand gesture toward the equipment."),
            MASKED_LISTEN), "P0")
add("V-H2LAB-03", "h2", H2LAB, "4s",
    compose(H2LAB_POSE, masked_speak(UNI_M, "One small hand gesture."),
            MASKED_LISTEN), "P0")
add(
    "V-H2LAB-04", "h2", H2LAB, "4s",
    compose(
        H2LAB_POSE,
        f"Only {COAT} is addressing the others. He lifts the document already in his "
        "hand slightly forward to show it and holds it there.\n"
        "The lifting motion is small and happens once.\n"
        "The mask moves very slightly with the jaw.\nOccasional blinking.",
        MASKED_LISTEN,
    ),
    "P1",
)

# ------------------------------------------------------- H2 引产手术室
H2IND = "h2/keyframes/induction_or/group_base_new.png"
add(
    "V-H2IND-01", "h2", H2IND, "6s",
    compose(
        "Both people remain standing where they are.",
        speak(f"{UNI_W} on the left"),
        "The person in blue scrubs and a mask on the right remains still and listens.\n"
        "No speaking. Only one very slight nod near the end.\n"
        "Occasional blinking.\nVery subtle breathing.\nKeep his hands still.",
    ),
    "P0",
)

# ------------------------------------------------------- H3 院方会议室
H3MEET = "h3/keyframes/meeting/group_base_new.png"
H3MEET_POSE = "All four people remain seated at the long table."
COAT_M = "the man in the white coat on the right side of the table"
COAT_W = "the woman in the white coat on the right side of the table"
add(
    "V-H3MEET-01", "h3", H3MEET, "8s",
    compose(H3MEET_POSE, speak(f"Only {UNI_M} on the left"),
            listen_many("All the other three people")),
    "P0",
)
add(
    "V-H3MEET-02", "h3", H3MEET, "6s",
    compose(H3MEET_POSE, speak(f"Only {UNI_W} on the left"),
            listen_many("All the other three people")),
    "P0",
)
add(
    "V-H3MEET-03", "h3", H3MEET, "6s",
    compose(
        H3MEET_POSE,
        f"Only {COAT_M} speaks. He lifts a small certificate slightly forward to show "
        "it and holds it there.\nThe lifting motion is small and happens once.\n"
        "Subtle mouth movement.\nOccasional blinking.",
        listen_many("All the other three people"),
    ),
    "P0",
)
add(
    "V-H3MEET-04", "h3", H3MEET, "6s",
    compose(H3MEET_POSE, speak(f"Only {COAT_W}"),
            listen_many("All the other three people")),
    "P0",
)

# ------------------------------------------------------- H3 门诊手术室
H3OR = "h3/keyframes/ambulatory_or/group_base_new.png"
H3OR_POSE = "All three people remain standing where they are."
add("V-H3OR-01", "h3", H3OR, "6s",
    compose(H3OR_POSE, speak(f"Only {UNI_W}"), listen_many("The other two people")),
    "P0")
add("V-H3OR-02", "h3", H3OR, "8s",
    compose(H3OR_POSE, speak(f"Only {UNI_M}"), listen_many("The other two people")),
    "P0")
add(
    "V-H3OR-03", "h3", H3OR, "4s",
    compose(
        H3OR_POSE,
        f"Only {COAT} on the right speaks. He lifts a small credential slightly "
        "forward to show it and holds it there.\n"
        "The lifting motion is small and happens once.\n"
        "Subtle mouth movement.\nOccasional blinking.",
        listen_many(BOTH_UNI),
    ),
    "P0",
)

# ------------------------------------------------------------ H3 药房
H3PH = "h3/keyframes/gyne_pharmacy/group_base_new.png"
H3PH_POSE = (
    "The two people in dark navy uniform remain standing outside the window. "
    "The person in the white coat remains standing behind the window."
)
NO_COUNTER = "Nobody leans over the counter. Nobody walks around the counter."
add("V-H3PHARM-01", "h3", H3PH, "8s",
    compose(H3PH_POSE, speak(f"Only {UNI_M}"), listen_many("The other two people"),
            NO_COUNTER), "P0")
add("V-H3PHARM-02", "h3", H3PH, "8s",
    compose(H3PH_POSE, speak(f"Only {UNI_W}"), listen_many("The other two people"),
            NO_COUNTER), "P0")

# ------------------------------------------------------------ H3 超声科
H3US = "h3/keyframes/ultrasound/group_base_new.png"
H3US_POSE = (
    "The two people in dark navy uniform remain standing. "
    "The person in the white coat remains seated at the ultrasound machine."
)
add(
    "V-H3US-01", "h3", H3US, "6s",
    compose(
        H3US_POSE,
        f"Only {UNI_M} speaks. While speaking he raises one hand and makes a single "
        "small pointing gesture toward the sign on the wall, then lowers it.\n"
        "The gesture happens once.\nSubtle mouth movement.\nOccasional blinking.",
        listen_many("The other two people"),
    ),
    "P0",
)
add("V-H3US-02", "h3", H3US, "4s",
    compose(H3US_POSE, speak(f"Only {UNI_W}"), listen_many("The other two people")),
    "P0")

# ------------------------------------------------------------ H3 医务科
H3AFF = "h3/keyframes/medical_affairs/group_base_new.png"
add(
    "V-H3AFF-01", "h3", H3AFF, "8s",
    compose(
        "All three people remain seated at the table.",
        f"Only {UNI_M} speaks. He glances down at the open file in front of him once, "
        "then lifts his eyes again and keeps speaking.\n"
        "Subtle mouth movement.\nOccasional blinking.\nSubtle breathing.",
        listen_many("The other two people"),
    ),
    "P0",
)

# ------------------------------------------------------------ H3 病案室
H3REC = "h3/keyframes/medical_records/group_base_new.png"
H3REC_POSE = "All three people remain standing where they are."
add("V-H3REC-01", "h3", H3REC, "6s",
    compose(H3REC_POSE, speak(f"Only {UNI_M}"), listen_many("The other two people")),
    "P0")
add(
    "V-H3REC-02", "h3", H3REC, "4s",
    compose(
        H3REC_POSE,
        f"{COAT} turns one page of the open file with a small hand movement, glances "
        "down at it, then holds the file slightly forward toward the two people in "
        "uniform.\nThe page turn happens once. The forward motion is small.\n"
        "Her lips remain closed and still. No speaking.\nOccasional blinking.",
        listen_many(BOTH_UNI),
    ),
    "P2",
)

# ------------------------------------------------------------ H4 护士台
H4NUR = "h4/keyframes/nurse_station/group_base_new.png"
H4NUR_POSE = (
    "The two people in dark navy uniform remain standing outside the counter. "
    "The nurse remains standing behind the counter."
)
add(
    "V-H4NURSE-01", "h4", H4NUR, "6s",
    compose(
        H4NUR_POSE,
        f"Only {UNI_M} speaks. He lifts the folder in his hand slightly forward to "
        "show it and holds it there.\nThe lifting motion is small and happens once.\n"
        "Subtle mouth movement.\nOccasional blinking.",
        listen_many("The other two people"),
        NO_COUNTER,
    ),
    "P0",
)
add(
    "V-H4NURSE-02", "h4", H4NUR, "4s",
    compose(H4NUR_POSE, speak("Only the nurse behind the counter"),
            listen_many(BOTH_UNI), NO_COUNTER),
    "P0",
)

# ------------------------------------------------------- H4 产科主任办公室
H4DIR = "h4/keyframes/director_office/group_base_new.png"
H4DIR_POSE = (
    "The two people in dark navy uniform remain standing. "
    "The person in the white coat remains seated behind the desk."
)
add("V-H4DIR-01", "h4", H4DIR, "4s",
    compose(H4DIR_POSE, speak(f"Only {UNI_M}"), listen_many("The other two people")),
    "P0")
add("V-H4DIR-02", "h4", H4DIR, "6s",
    compose(H4DIR_POSE, speak(f"Only {UNI_W}"), listen_many("The other two people")),
    "P0")

# ------------------------------------------------------- H4 洗手池与污洗区
H4HAND = "h4/keyframes/delivery_unit/group_base_new.png"
H4HAND_POSE = "All three people remain standing where they are."
SCRUBS = "the person in blue scrubs and a surgical cap"
add(
    "V-H4HAND-01", "h4", H4HAND, "6s",
    compose(
        H4HAND_POSE,
        f"Only {UNI_W} speaks. While speaking she raises one hand and makes a single "
        "small pointing gesture toward the row of sinks, then lowers it.\n"
        "The gesture happens once.\nSubtle mouth movement.\nOccasional blinking.",
        listen_many("The other two people"),
    ),
    "P0",
)
add("V-H4HAND-02", "h4", H4HAND, "4s",
    compose(H4HAND_POSE, speak(f"Only {SCRUBS}"), listen_many(BOTH_UNI)), "P0")
add("V-H4HAND-03", "h4", H4HAND, "4s",
    compose(H4HAND_POSE, speak(f"Only {UNI_M}"), listen_many("The other two people")),
    "P0")
add(
    "V-H4HAND-04", "h4", H4HAND, "4s",
    compose(
        H4HAND_POSE,
        f"Only {UNI_W} speaks. She looks down at the clipboard in her hand, writes a "
        "few short strokes with the pen, then lifts her head slightly.\n"
        "The pen strokes are small.\nSubtle mouth movement.\nOccasional blinking.",
        listen_many("The other two people"),
    ),
    "P1",
)

# ------------------------------------------------------- H4 出生医学证明
H4BIR = "h4/keyframes/birth_certificate/group_base_new.png"
H4BIR_POSE = (
    "The two people in dark navy uniform remain standing outside the window. "
    "The staff member remains behind the window."
)
add("V-H4BIRTH-01", "h4", H4BIR, "4s",
    compose(H4BIR_POSE, speak(f"Only {UNI_M}"), listen_many("The other two people"),
            NO_COUNTER), "P0")
add(
    "V-H4BIRTH-02", "h4", H4BIR, "6s",
    compose(
        H4BIR_POSE,
        f"Only {UNI_W} speaks. While speaking she raises one hand and makes a single "
        "small pointing gesture toward the record behind the window, then lowers it.\n"
        "The gesture happens once.\nSubtle mouth movement.\nOccasional blinking.",
        listen_many("The other two people"),
        NO_COUNTER,
    ),
    "P0",
)
add(
    "V-H4BIRTH-03", "h4", H4BIR, "4s",
    compose(
        H4BIR_POSE,
        "The staff member behind the window looks down and makes small typing "
        "movements with her fingers, then moves her mouse hand slightly.\n"
        "Only her fingers and wrist move.\n"
        "Her lips remain closed and still. No speaking.\nOccasional blinking.",
        "The two people in dark navy uniform remain completely still and watch.\n"
        "Their lips remain closed and still. No speaking from them.",
    ),
    "P1",
)

# ------------------------------------------------------- H4 产科病案室
H4REC = "h4/keyframes/obstetrics_records/group_base_new.png"
H4REC_POSE = "All three people remain standing where they are."
add("V-H4REC-01", "h4", H4REC, "6s",
    compose(H4REC_POSE, speak(f"Only {UNI_W}"), listen_many("The other two people")),
    "P0")
add(
    "V-H4REC-02", "h4", H4REC, "4s",
    compose(
        H4REC_POSE,
        f"{COAT} turns one page of the open file with a small hand movement, glances "
        "down at it, then holds the file slightly forward toward the two people in "
        "uniform.\nThe page turn happens once. The forward motion is small.\n"
        "Her lips remain closed and still. No speaking.\nOccasional blinking.",
        listen_many(BOTH_UNI),
    ),
    "P1",
)


def prep_image(rel: str) -> Path:
    """Downscale once into assets_1080 (1920x1080) or assets_720 (1280x720)."""
    src = ASSETS / rel
    dst = (PREPPED / rel).with_suffix(".jpg")
    if dst.is_file() and dst.stat().st_mtime >= src.stat().st_mtime:
        return dst
    from PIL import Image

    dst.parent.mkdir(parents=True, exist_ok=True)
    w, h = PREP_SIZE[RESOLUTION]
    im = Image.open(src).convert("RGB").resize((w, h), Image.LANCZOS)
    im.save(dst, quality=92, subsampling=0)
    return dst


def load_state() -> dict:
    if STATE.is_file():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--reverse", action="store_true")
    ap.add_argument("--resolution", choices=["720p", "1080p"])
    ap.add_argument("--state")
    ap.add_argument("--outroot")
    ap.add_argument("ids", nargs="*")
    args = ap.parse_args()
    apply_run_config(
        reverse=args.reverse,
        resolution=args.resolution,
        state=args.state,
        outroot=args.outroot,
    )
    only = args.ids or None
    order = {"P0": 0, "P1": 1, "P2": 2}
    queue = sorted(TASKS, key=lambda t: order[t["prio"]])
    state = load_state()

    # V-MEET-01 was generated by hand into static/video/preview/.
    done_preview = REPO / "static/video/preview"
    if (not args.reverse) and list(done_preview.glob("V-MEET-01*.mp4")):
        state.setdefault(
            "V-MEET-01",
            {"status": "ok", "sec": 8, "note": "generated earlier into preview/"},
        )
        save_state(state)

    spent = sum(
        v.get("sec", 0) for v in state.values() if v.get("status") == "ok"
    ) * (0.03 if RESOLUTION == "720p" else 0.05)
    total = len(TASKS)
    consec_fail = 0

    for task in queue:
        vid = task["id"]
        if only and vid not in only:
            continue
        if state.get(vid, {}).get("status") == "ok":
            continue
        outdir = OUTROOT / task["folder"]
        outdir.mkdir(parents=True, exist_ok=True)
        out = outdir / f"{vid}_{task['dur']}_{RESOLUTION}.mp4"
        if out.is_file():
            state[vid] = {"status": "ok", "sec": int(task["dur"][:-1]),
                          "path": str(out)}
            save_state(state)
            continue

        img = prep_image(task["img"])
        ndone = sum(1 for v in state.values() if v.get("status") == "ok")
        print(f"\n=== [{ndone + 1}/{total}] {vid} ({task['prio']}, {task['dur']}, "
              f"{RESOLUTION}) spent≈${spent:.2f}", flush=True)

        proc = subprocess.run(
            [sys.executable, str(I2V),
             "--image", str(img),
             "--prompt", task["prompt"],
             "--duration", task["dur"],
             "--resolution", RESOLUTION,
             "--out", str(out)],
            capture_output=True, text=True,
        )
        blob = (proc.stdout + proc.stderr)
        print(blob[-1200:], flush=True)

        if proc.returncode == 0 and out.is_file():
            sec = int(task["dur"][:-1])
            spent += sec * 0.05
            state[vid] = {"status": "ok", "sec": sec, "path": str(out)}
            consec_fail = 0
        else:
            low = blob.lower()
            billing = any(m in low for m in BILLING_MARKERS)
            state[vid] = {
                "status": "billing_stop" if billing else "failed",
                "error": blob.strip()[-600:],
            }
            save_state(state)
            if billing:
                print(f"\n!!! BILLING STOP at {vid} — halting, no retries.",
                      flush=True)
                break
            consec_fail += 1
            if consec_fail >= 3:
                print("\n!!! three consecutive failures — halting.", flush=True)
                break
        save_state(state)
        time.sleep(2)

    ok = [k for k, v in state.items() if v.get("status") == "ok"]
    bad = [k for k, v in state.items() if v.get("status") not in (None, "ok")]
    todo = [t["id"] for t in TASKS if t["id"] not in state]
    print("\n===== SUMMARY =====")
    print(f"ok={len(ok)} failed={len(bad)} todo={len(todo)} total={total}")
    print(f"spent≈${spent:.2f}")
    print("failed:", bad)
    save_state(state)


if __name__ == "__main__":
    main()
