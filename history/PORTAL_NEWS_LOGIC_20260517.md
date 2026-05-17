# Portal News Header Logic Update (2026-05-17)

## 1. 개요
- **목적**: 포털 서비스의 일일 뉴스 요약 모달에서 헤더(타이틀) 인식 로직을 단순화하고 명확히 함.
- **배경**: 기존의 복잡한 텍스트 기반 체크 대신 이모지를 활용한 직관적인 타이틀 구분을 지향함.

## 2. 주요 변경 사항
### 로직 수정 (portal/app.py)
- **헤더 인식 기준 변경**: 
  - 기존: `🤖` 또는 `📰`로 시작하거나, `[`로 시작하고 `뉴스`를 포함하는 줄.
  - 변경: `🤖` 또는 `📰` 이모지로 시작하는 줄만 헤더로 인식.
- **코드 변경점**:
  ```javascript
  // 이전
  const isHeader = line.startsWith('🤖') || line.startsWith('📰') || (line.startsWith('[') && line.includes('뉴스'));
  
  // 이후
  const isHeader = line.startsWith('🤖') || line.startsWith('📰');
  ```

## 3. 결과 및 기대 효과
- **일관성**: 사용자가 명시적으로 이모지를 사용하여 타이틀을 지정하므로 오인식 가능성 감소.
- **가독성**: 코드 로직이 단순해져 유지보수 용이성 향상.

## 4. 관련 파일
- `portal/app.py`
