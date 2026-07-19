/** @deprecated v=16 characterization aliases for the production phone Loader lifecycle. */
export {
  PHONE_LOADER_COMPLETE_KEY as PORTRAIT_LOADER_COMPLETE_KEY,
  PHONE_LOADER_HIDDEN_AT_KEY as PORTRAIT_LOADER_HIDDEN_AT_KEY,
  attachPhoneLoaderVisibilityLifecycle as attachPortraitLoaderVisibilityLifecycle,
  markPhoneLoaderCompletedInDocument as markPortraitLoaderCompletedInDocument,
  phoneLoaderCompletedInDocument as portraitLoaderCompletedInDocument
} from '../phone/phone-loader-lifecycle';
