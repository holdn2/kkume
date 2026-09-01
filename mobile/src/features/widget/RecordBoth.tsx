import { HStack, Image, Link, Text, VStack } from '@expo/ui/swift-ui';
import { font, frame } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * 잠금화면 진입점. **위젯 하나에 탭 영역 두 개**다(2026-08-31 결정).
 *
 * 왼쪽이 녹음, 오른쪽이 텍스트다. 스파이크 ①-B에서 실측으로 통과했다 —
 * `accessoryCircular`는 탭 영역이 하나라 `widgetURL`만 먹지만,
 * `accessoryRectangular`에서는 `Link`가 무시되지 않는다.
 *
 * **`widgetURL`을 일부러 넣지 않는다.** 넣으면 `Link`가 죽어도 앱이 열려서
 * "되는 것처럼" 보이고, 그러면 어느 쪽을 눌렀는지 모르는 채로 기록이 시작된다.
 *
 * 기호는 SF Symbol로 그린다. 잠금화면은 `widgetRenderingMode`가 `vibrant`라
 * **어차피 단색으로 렌더되므로** 색을 지정하지 않는다 — 지정해도 시스템이 덮는다.
 *
 * ---
 *
 * **이 함수 안에서 모듈 스코프 변수를 쓰지 않는다**(절대 규칙 9).
 * `'widget'` 함수는 문자열로 직렬화돼 격리된 JS 컨텍스트에서 평가된다.
 * 그 안에는 import한 것과 `props`·`environment`만 있고 이 파일의 상수는 없다.
 * 참조하면 `ReferenceError`로 죽는데 **예외가 안 보이고 위젯이 조용히 빈 채로 뜨기 때문에**
 * "딥링크가 안 된다"로 오진하기 딱 좋다. 그래서 URL도 여기 직접 박는다.
 */
const RecordBoth = (_props: object, _environment: WidgetEnvironment) => {
  'widget';
  return (
    <HStack spacing={0} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
      <Link
        destination="kkume://record?mode=voice&from=widget"
        modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}
      >
        <VStack spacing={2}>
          <Image systemName="mic.fill" size={18} />
          <Text modifiers={[font({ size: 11, weight: 'medium' })]}>말하기</Text>
        </VStack>
      </Link>
      <Link
        destination="kkume://record?mode=text&from=widget"
        modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}
      >
        <VStack spacing={2}>
          <Image systemName="square.and.pencil" size={18} />
          <Text modifiers={[font({ size: 11, weight: 'medium' })]}>적기</Text>
        </VStack>
      </Link>
    </HStack>
  );
};

export default createWidget('RecordBoth', RecordBoth);
