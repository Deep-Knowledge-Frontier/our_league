import React, { useState, useMemo } from 'react';
import {
  Dialog, Box, Typography, IconButton, Accordion, AccordionSummary,
  AccordionDetails, TextField, InputAdornment, Chip, Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { FAQ_CATEGORIES, getAllFaqs } from '../data/faqs';

export default function HelpDialog({ open, onClose }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(null); // null = 전체

  // 검색 결과 (문자열 기반만, React 노드는 stringify)
  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return getAllFaqs().filter((item) => {
      const aStr = typeof item.a === 'string' ? item.a : '';
      return (
        item.q.toLowerCase().includes(q) ||
        aStr.toLowerCase().includes(q)
      );
    });
  }, [search]);

  const visibleCategories = useMemo(() => {
    if (activeCategory) {
      return FAQ_CATEGORIES.filter((c) => c.key === activeCategory);
    }
    return FAQ_CATEGORIES;
  }, [activeCategory]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '90vh' } }}
    >
      {/* 헤더 */}
      <Box sx={{
        background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
        color: 'white', px: 2.5, py: 2,
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <HelpOutlineIcon sx={{ fontSize: 26 }} />
        <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', flex: 1 }}>
          도움말 / Q&amp;A
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* 검색 */}
      <Box sx={{ px: 2.5, pt: 2, pb: 1, bgcolor: '#FAFAFA' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="궁금한 내용을 검색하세요 (예: 드래프트, 트레이드, 포메이션)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20, color: '#666' }} />
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'white' } }}
        />

        {/* 카테고리 필터 칩 */}
        {!search.trim() && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.2 }}>
            <Chip
              label="전체"
              size="small"
              onClick={() => setActiveCategory(null)}
              sx={{
                fontWeight: 700, fontSize: '0.72rem',
                bgcolor: activeCategory === null ? '#2D336B' : '#E0E0E0',
                color: activeCategory === null ? 'white' : '#555',
              }}
            />
            {FAQ_CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              return (
                <Chip
                  key={cat.key}
                  label={cat.title}
                  size="small"
                  onClick={() => setActiveCategory(cat.key)}
                  sx={{
                    fontWeight: 700, fontSize: '0.72rem',
                    bgcolor: active ? cat.color : '#F0F2F5',
                    color: active ? 'white' : '#555',
                    border: cat.highlight && !active ? `1px solid ${cat.color}` : 'none',
                  }}
                />
              );
            })}
          </Box>
        )}
      </Box>

      {/* FAQ 리스트 */}
      <Box sx={{ px: 2.5, py: 1.5, overflowY: 'auto', flex: 1 }}>
        {/* 검색 결과 */}
        {filtered && (
          <>
            <Typography sx={{ fontSize: '0.78rem', color: '#888', mb: 1 }}>
              {filtered.length === 0
                ? '검색 결과가 없습니다'
                : `검색 결과 ${filtered.length}개`}
            </Typography>
            {filtered.map((item) => (
              <FaqItem key={item.id} item={item} defaultExpanded={filtered.length <= 3} />
            ))}
            {filtered.length === 0 && (
              <Alert severity="info" sx={{ mt: 1 }}>
                다른 키워드로 검색해보시거나, 카테고리별로 탐색해보세요.
              </Alert>
            )}
          </>
        )}

        {/* 카테고리별 리스트 */}
        {!filtered && visibleCategories.map((cat) => (
          <Box key={cat.key} sx={{ mb: 2 }}>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1, mb: 0.8,
              pb: 0.5, borderBottom: `2px solid ${cat.color}`,
            }}>
              <Typography sx={{ fontWeight: 900, fontSize: '0.95rem', color: cat.color }}>
                {cat.title}
              </Typography>
              {cat.highlight && (
                <Chip label="신규" size="small"
                  sx={{ height: 18, fontSize: '0.62rem', bgcolor: cat.color, color: 'white', fontWeight: 800 }} />
              )}
              <Typography sx={{ ml: 'auto', fontSize: '0.72rem', color: '#999' }}>
                {cat.items.length}개
              </Typography>
            </Box>
            {cat.items.map((item) => (
              <FaqItem key={item.id} item={item} />
            ))}
          </Box>
        ))}

        {/* 문의 섹션 */}
        {!filtered && !activeCategory && (
          <Box sx={{
            mt: 2, p: 2, borderRadius: 2,
            bgcolor: '#F3E5F5', border: '1px solid #E1BEE7',
          }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: '#4A148C', mb: 0.5 }}>
              💬 추가 문의사항이 있나요?
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: '#666' }}>
              여기서 답을 못 찾으셨다면 클럽 관리자나 개발자에게 직접 문의해주세요.
              앱 사용 중 버그를 발견하셨다면 스크린샷과 함께 알려주시면 빠르게 확인할게요.
            </Typography>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}

function FaqItem({ item, defaultExpanded = false }) {
  const aContent = typeof item.a === 'string'
    ? item.a.split('\n').map((line, i) => (
        <Typography key={i} sx={{ fontSize: '0.82rem', color: '#444', lineHeight: 1.6, mb: 0.3 }}>
          {line}
        </Typography>
      ))
    : <Typography sx={{ fontSize: '0.82rem', color: '#444', lineHeight: 1.6 }}>{item.a}</Typography>;

  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      elevation={0}
      sx={{
        mb: 0.6,
        border: '1px solid #E0E0E0',
        borderRadius: 2,
        overflow: 'hidden',
        '&:before': { display: 'none' },
        '&.Mui-expanded': { borderColor: '#1565C0', borderWidth: 1.5 },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          minHeight: 44,
          '& .MuiAccordionSummary-content': { my: 0.8 },
        }}
      >
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#222' }}>
          Q. {item.q}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, pb: 1.5, bgcolor: '#FAFBFC' }}>
        {aContent}
      </AccordionDetails>
    </Accordion>
  );
}
