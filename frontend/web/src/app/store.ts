import { configureStore } from '@reduxjs/toolkit';
import { apiErrorMiddleware } from './apiErrorMiddleware';
import { posApi } from '../modules/pos/api/posApi';
import posReducer from '../modules/pos/store/posSlice';
import uiReducer from './uiSlice';

export const store = configureStore({
  reducer: {
    pos: posReducer,
    ui: uiReducer,
    [posApi.reducerPath]: posApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(posApi.middleware, apiErrorMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
