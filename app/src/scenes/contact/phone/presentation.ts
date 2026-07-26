import { createPaperEntranceLifecycle } from '../../shared/paperEntrance';

const contactEntrance = createPaperEntranceLifecycle('contact', 20);

export const renderPhoneContactProgress = contactEntrance.renderProgress;
export const renderPhoneContactEntrance = contactEntrance.renderEntrance;
export const releasePhoneContactEntrance = contactEntrance.release;
export const renderPhoneContactHold = contactEntrance.renderHold;
