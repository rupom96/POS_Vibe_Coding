import { createSlice } from '@reduxjs/toolkit';

export interface UiState {
  theme: 'dark' | 'light';
  navOpen: boolean;
}

const initialState: UiState = {
  theme: 'light',
  navOpen: true,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
    },
    setNavOpen(state, action: { payload: boolean }) {
      state.navOpen = action.payload;
    },
    toggleNav(state) {
      state.navOpen = !state.navOpen;
    },
  },
});

export const { toggleTheme, setNavOpen, toggleNav } = uiSlice.actions;
export default uiSlice.reducer;
